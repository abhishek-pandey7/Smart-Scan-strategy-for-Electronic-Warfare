"""PRIMES backend API.

    uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from primes.data.turing import available_configs
from primes.eval.replay import replay
from primes.eval.runner import (POLICY_INFO, SCENARIO_INFO, available_policies, load_scenario, make_policy,
                                priors)
from primes.eval.serialize import scenario_payload, trace_payload

ROOT = Path(__file__).resolve().parents[1]
RUN_CACHE = ROOT / "artifacts" / "runs"
BENCHMARK = ROOT / "artifacts" / "benchmark.json"
ROBUSTNESS = ROOT / "artifacts" / "robustness.json"
ASSOCIATION = ROOT / "artifacts" / "association.json"
CACHE_VERSION = "v3"  # bump whenever scheduler behaviour or the run payload changes

app = FastAPI(title="PRIMES API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])


class RunRequest(BaseModel):
    scenario: str = "lockout"
    seed: int = Field(0, ge=0, le=10_000)
    policies: list[str] = ["raster", "primes"]
    p_d: float = Field(1.0, gt=0.0, le=1.0)
    p_fa: float = Field(0.0, ge=0.0, le=0.5)


def _run_id(req: RunRequest) -> str:
    key = json.dumps([CACHE_VERSION, req.scenario, req.seed, sorted(req.policies), req.p_d, req.p_fa])
    return hashlib.sha1(key.encode()).hexdigest()[:16]


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
