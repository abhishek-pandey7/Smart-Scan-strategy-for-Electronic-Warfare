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
CACHE_VERSION = "v1"

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


@app.get("/api/benchmark")
def benchmark() -> dict:
    if not BENCHMARK.exists():
        raise HTTPException(404, "benchmark not generated yet: run python -m experiments.benchmark")
    return json.loads(BENCHMARK.read_text())
