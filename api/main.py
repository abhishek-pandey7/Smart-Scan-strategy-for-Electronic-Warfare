"""Smart Scan backend API.

    uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

from primes.data.turing import available_configs
from primes.eval.replay import replay
from primes.eval.runner import (POLICY_INFO, SCENARIO_INFO, available_policies, load_scenario, make_policy,
                                priors)
from primes.eval.serialize import scenario_payload, trace_payload
from primes.policies.dqn import DEFAULT_MODEL

ROOT = Path(__file__).resolve().parents[1]
RUN_CACHE = ROOT / "artifacts" / "runs"
BENCHMARK = ROOT / "artifacts" / "benchmark.json"
ROBUSTNESS = ROOT / "artifacts" / "robustness.json"
ASSOCIATION = ROOT / "artifacts" / "association.json"
CACHE_VERSION = "v4"  # bump whenever scheduler behaviour, default lineup or payload format changes
LINEUP = ["primes", "dqn", "greedy", "raster", "random", "oracle"]
PRIORS_PATH = ROOT / "primes" / "assets" / "priors.json"
THREAT_PATH = ROOT / "primes" / "assets" / "threat_model.joblib"
EVAL_NPZ = ROOT / "artifacts" / "models" / "evaluations.npz"

app = FastAPI(title="Smart Scan API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=4096)


def _default_lineup() -> list[str]:
    avail = set(available_policies())
    return [p for p in LINEUP if p in avail]


class RunRequest(BaseModel):
    scenario: str = "lockout"
    seed: int = Field(0, ge=0, le=10_000)
    policies: list[str] = Field(default_factory=_default_lineup)
    p_d: float = Field(1.0, gt=0.0, le=1.0)
    p_fa: float = Field(0.0, ge=0.0, le=0.5)


def _run_id(req: RunRequest) -> str:
    key = json.dumps([CACHE_VERSION, req.scenario, req.seed, sorted(req.policies), req.p_d, req.p_fa])
    return hashlib.sha1(key.encode()).hexdigest()[:16]


def _dqn_curve() -> dict | None:
    if not EVAL_NPZ.exists():
        return None
    data = np.load(EVAL_NPZ)
    # EvalCallback: results shape [n_evals, n_episodes] -> mean over episodes
    return {
        "timesteps": data["timesteps"].astype(int).tolist(),
        "mean_reward": data["results"].mean(axis=1).tolist(),
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "priors": priors().name}


@app.get("/api/catalog")
def catalog() -> dict:
    return {
        "scenarios": [{"id": k, "description": v} for k, v in SCENARIO_INFO.items()]
                     + [{"id": f"turing:{c}", "description": f"Turing val_stare config_{c} (real dataset)"}
                        for c in available_configs()],
        "policies": [{"id": p, "description": POLICY_INFO[p]} for p in available_policies()],
    }


@app.get("/api/models")
def models() -> dict:
    dqn_ok = DEFAULT_MODEL.exists()
    return {
        "models": [
            {
                "id": "priors",
                "name": "Learned priors",
                "kind": "prior",
                "description": (
                    "Emitter period, frequency and flash-width priors fit from the Turing dataset "
                    f"({'present' if PRIORS_PATH.exists() else 'missing'}; primes/assets/priors.json)."
                ),
            },
            {
                "id": "track_predictor",
                "name": "Track predictor",
                "kind": "predictor",
                "description": (
                    "Periodic and Markov track models that forecast the next flash "
                    "(primes/predict)."
                ),
            },
            {
                "id": "threat_classifier",
                "name": "Threat classifier",
                "kind": "classifier",
                "description": (
                    "Emitter threat-level classifier "
                    f"({'present' if THREAT_PATH.exists() else 'missing'}; "
                    "primes/assets/threat_model.joblib)."
                ),
            },
            {
                "id": "dqn",
                "name": "Double-DQN",
                "kind": "rl",
                "description": (
                    "Model-free Double-DQN reinforcement learning comparator "
                    f"({'available' if dqn_ok else 'not trained yet'}; artifacts/models/dqn.zip)."
                ),
            },
            {
                "id": "smart_scan",
                "name": "Smart Scan",
                "kind": "scheduler",
                "description": (
                    "Predict-then-score scheduler with live Search / Track / Extend mode switching "
                    "(internal policy id: primes)."
                ),
            },
        ],
        "dqn_curve": _dqn_curve(),
    }


@app.post("/api/runs")
def create_run(req: RunRequest) -> dict:
    unknown = set(req.policies) - set(available_policies())
    if unknown:
        raise HTTPException(400, f"unknown or unavailable policies: {sorted(unknown)}")
    run_id = _run_id(req)
    path = RUN_CACHE / f"{run_id}.json"
    if path.exists():
        return json.loads(path.read_text())

    try:
        truth = load_scenario(req.scenario, req.seed)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    payload = {"id": run_id, "request": req.model_dump(), "scenario": scenario_payload(truth), "runs": {}}
    for name in req.policies:
        trace = replay(make_policy(name), truth, priors(), seed=req.seed, p_d=req.p_d, p_fa=req.p_fa)
        payload["runs"][name] = trace_payload(trace, truth)

    RUN_CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")))
    return payload


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict:
    path = RUN_CACHE / f"{run_id}.json"
    if not run_id.isalnum() or not path.exists():
        raise HTTPException(404, "run not found")
    return json.loads(path.read_text())


@app.get("/api/accuracy")
def accuracy() -> dict:
    """Everything the accuracy page needs, pre-aggregated: where points are lost, robustness, association."""
    if not BENCHMARK.exists():
        raise HTTPException(404, "benchmark not generated yet: run python -m experiments.benchmark")
    bench = json.loads(BENCHMARK.read_text())
    breakdown = []
    for group in dict.fromkeys(r["group"] for r in bench["rows"]):
        for policy in ("raster", "greedy", "dqn", "primes", "oracle"):
            sel = [r for r in bench["rows"] if r["group"] == group and r["policy"] == policy]
            if not sel:
                continue
            # Per run, the three shares add to 1: caught; missed after the emitter was found (flashes from the
            # first catch on, times the tracking miss rate); everything else was lost before discovery.
            caught = [r["interception_ratio"] for r in sel]
            missed = [(1 - (r["tracked_ratio"] or 0.0)) * (1 - r["pre_discovery_loss"]) if r["tracked_ratio"] is not None else 0.0
                      for r in sel]
            tracked = [r["tracked_ratio"] for r in sel if r["tracked_ratio"] is not None]
            n = len(sel)
            breakdown.append({
                "group": group, "policy": policy, "n": n,
                "caught": sum(caught) / n,
                "missed_while_tracking": sum(missed) / n,
                "lost_before_discovery": sum(max(0.0, 1 - c - m) for c, m in zip(caught, missed)) / n,
                "tracked_ratio": sum(tracked) / len(tracked) if tracked else None,
                "discovery_fraction": sum(r["discovery_fraction"] for r in sel) / n,
            })
    robustness = None
    if ROBUSTNESS.exists():
        rob = json.loads(ROBUSTNESS.read_text())
        robustness = {"conditions": [{"id": c, "p_d": pd, "p_fa": pfa} for c, pd, pfa in rob["conditions"]],
                      "summary": [{k: e.get(k) for k in ("condition", "group", "policy", "n", "interception_ratio", "false_alarms")}
                                  for e in rob["summary"] if e["group"] in ("all", "turing")]}
    association = json.loads(ASSOCIATION.read_text()) if ASSOCIATION.exists() else None
    return {"generated": bench["generated"], "breakdown": breakdown, "robustness": robustness, "association": association}


@app.get("/api/benchmark")
def benchmark() -> dict:
    if not BENCHMARK.exists():
        raise HTTPException(404, "benchmark not generated yet: run python -m experiments.benchmark")
    return json.loads(BENCHMARK.read_text())
