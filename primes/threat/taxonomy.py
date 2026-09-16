"""Analyst-defined threat levels per radar function (see primes/assets/threat_taxonomy.json)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "assets" / "threat_taxonomy.json"
LEVELS = ("low", "medium", "high")


@lru_cache(maxsize=1)
def _taxonomy() -> tuple[dict[str, str], dict[str, float]]:
    t = json.loads(PATH.read_text())
    return {name: level for level, names in t["levels"].items() for name in names}, t["weights"]


def threat_level(function: str) -> str:
    return _taxonomy()[0].get(function, "")


def threat_weight(level: str) -> float:
    """Priority weight of a threat level; unlabelled emitters weigh 1."""
    return float(_taxonomy()[1].get(level, 1.0))
