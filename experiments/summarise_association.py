"""Summarise the labelled-vs-self-deinterleaved comparison into artifacts/association.json (served to the web app).

    python -m experiments.compare_variants --variants base pdw --seeds 3 --tag pdw1
    python -m experiments.summarise_association --tag pdw1
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FAMILIES = ["easy", "lockout", "popup", "dense", "mixed", "turing"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="pdw1")
    args = ap.parse_args()
    rows = [json.loads(line) for line in (ROOT / "artifacts" / "variants.jsonl").read_text().splitlines()]
    rows = [r for r in rows if r.get("tag") == args.tag and r["variant"] in ("base", "pdw")]

    def mean(sel, k):
        v = [r[k] for r in sel if r.get(k) is not None]
        return float(np.mean(v)) if v else None

    groups = []
    for g in FAMILIES:
        base = [r for r in rows if r["scenario"] == g and r["variant"] == "base"]
        pdw = [r for r in rows if r["scenario"] == g and r["variant"] == "pdw"]
        if base and pdw:
            groups.append({"group": g, "n": len(pdw),
                           "labelled": mean(base, "interception_ratio"), "self_sorted": mean(pdw, "interception_ratio"),
                           "purity": mean(pdw, "association_purity"), "tracks_per_emitter": mean(pdw, "tracks_per_emitter"),
                           "contaminated_tracks": mean(pdw, "contaminated_tracks")})
    out = {"tag": args.tag, "note": "tuning scenarios (simulated seeds 10000+, Turing configs 5/50/100), disjoint from the benchmark",
           "groups": groups,
           "mean": {"labelled": float(np.mean([g["labelled"] for g in groups])),
                    "self_sorted": float(np.mean([g["self_sorted"] for g in groups]))}}
    path = ROOT / "artifacts" / "association.json"
    path.write_text(json.dumps(out, indent=1))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
