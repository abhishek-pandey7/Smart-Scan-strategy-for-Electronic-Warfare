"""Bake the whole API into static JSON under web/public/api.

Runs the FastAPI handlers in-process on a machine that has the Turing dataset and
artifacts/models/dqn.zip, then writes their output as flat files. The deployed site
is then pure static: no Python, no dataset, no torch, nothing to keep awake.

The run filenames must match runSlug() in web/src/lib/api.ts.

Usage:
    python -m scripts.export_static
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from api.main import RunRequest, accuracy, benchmark, catalog, create_run, models
from primes.data.turing import available_configs

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "api"

# Scenarios the deployed demo offers. Anything not listed here is removed from the
# catalog, so the picker can never offer something that has no baked run.
SIM = ["easy", "lockout", "popup", "dense", "mixed"]
TURING = [192, 3, 62]
# /eklavya and /how-it-decides ask for Eklavya on its own.
SOLO = ["lockout", "easy", "mixed"]


def slug(scenario: str, policies: list[str]) -> str:
    return f"{re.sub(r'[^A-Za-z0-9]+', '-', scenario)}__{'-'.join(sorted(policies))}"


def write(path: Path, payload: object) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode())


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    have = set(available_configs())
    missing = [c for c in TURING if c not in have]
    if missing:
        print(f"warning: Turing configs {missing} not present locally; skipping them")
    scenarios = SIM + [f"turing:{c}" for c in TURING if c in have]

    total = 0
    baked: set[str] = set()

    for sc in scenarios:
        req = RunRequest(scenario=sc)
        payload = create_run(req)
        name = slug(sc, req.policies)
        total += write(OUT / "runs" / f"{name}.json", payload)
        baked.add(sc)
        print(f"  {name}.json  ({', '.join(payload['runs'])})")

    for sc in SOLO:
        req = RunRequest(scenario=sc, policies=["primes"])
        payload = create_run(req)
        name = slug(sc, ["primes"])
        total += write(OUT / "runs" / f"{name}.json", payload)
        print(f"  {name}.json  (Eklavya only)")

    # Trim the catalog to what actually has a baked run.
    cat = catalog()
    cat["scenarios"] = [s for s in cat["scenarios"] if s["id"] in baked]
    total += write(OUT / "catalog.json", cat)

    for name, fn in (("benchmark", benchmark), ("accuracy", accuracy), ("models", models)):
        try:
            total += write(OUT / f"{name}.json", fn())
        except Exception as exc:  # a missing artifact must not kill the export
            print(f"warning: {name} skipped ({exc})")

    files = sum(1 for _ in OUT.rglob("*.json"))
    print(f"\n{files} files, {total / 1e6:.1f} MB -> {OUT}")
    print(f"catalog offers {len(cat['scenarios'])} scenarios")


if __name__ == "__main__":
    main()
