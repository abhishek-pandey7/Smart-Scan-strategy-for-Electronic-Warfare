"""Train and evaluate the threat classifier.

    python -m primes.threat.train

Train: every emitter in the 2,500 training scenarios, each observed several times through the noisy
measurement model. Test: every emitter in the 250 validation scenarios (different scenarios), observed
once. Writes primes/assets/threat_model.joblib and a report to artifacts/threat_report.json.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from primes.threat.features import FEATURES, observe

ROOT = Path(__file__).resolve().parents[2]
TAXONOMY = ROOT / "primes" / "assets" / "threat_taxonomy.json"
MODEL = ROOT / "primes" / "assets" / "threat_model.joblib"
LEVELS = ["low", "medium", "high"]


def load_taxonomy() -> dict[str, str]:
    t = json.loads(TAXONOMY.read_text())
    return {name: level for level, names in t["levels"].items() for name in names}


def dataset(population: list[dict], taxonomy: dict[str, str], copies: int, seed: int):
    rng = np.random.default_rng(seed)
    X, y, fn = [], [], []
    for e in population:
        level = taxonomy.get(e["function"])
        if level is None:
            continue
        for _ in range(copies):
            X.append(observe(e, rng))
            y.append(LEVELS.index(level))
            fn.append(e["function"])
    return np.array(X), np.array(y), np.array(fn)


def main() -> None:
    from joblib import dump
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.metrics import classification_report, confusion_matrix

    ap = argparse.ArgumentParser()
    ap.add_argument("--train", default=str(ROOT / "artifacts" / "population_train_scan.json"))
    ap.add_argument("--test", default=str(ROOT / "artifacts" / "population_val_scan.json"))
    ap.add_argument("--copies", type=int, default=3)
    args = ap.parse_args()

    taxonomy = load_taxonomy()
    train = json.loads(Path(args.train).read_text())
    test = json.loads(Path(args.test).read_text())
    Xtr, ytr, _ = dataset(train, taxonomy, args.copies, seed=0)
    Xte, yte, fte = dataset(test, taxonomy, 1, seed=1)
    print(f"train {len(Xtr)} observations from {len(train)} emitters; test {len(Xte)} from {len(test)} emitters")

    clf = HistGradientBoostingClassifier(max_iter=400, learning_rate=0.08, max_leaf_nodes=63,
                                         class_weight="balanced", random_state=0)
    clf.fit(Xtr, ytr)
    proba = clf.predict_proba(Xte)
    pred = proba.argmax(axis=1)

    report = classification_report(yte, pred, target_names=LEVELS, output_dict=True)
    cm = confusion_matrix(yte, pred).tolist()
    # priority weight the scheduler would assign, averaged per true threat level
    w = np.array([json.loads(TAXONOMY.read_text())["weights"][l] for l in LEVELS])
    expected_w = proba @ w
    per_level_w = {l: float(expected_w[yte == i].mean()) for i, l in enumerate(LEVELS)}
    prior = np.bincount(ytr, minlength=3) / len(ytr)

    out = {
        "features": FEATURES, "levels": LEVELS, "n_train": int(len(Xtr)), "n_test": int(len(Xte)),
        "class_prior_train": prior.round(4).tolist(),
        "accuracy": report["accuracy"], "macro_f1": report["macro avg"]["f1-score"],
        "per_class": {l: {k: round(report[l][k], 4) for k in ("precision", "recall", "f1-score")} for l in LEVELS},
        "confusion": cm,
        "mean_priority_weight_by_true_level": {k: round(v, 3) for k, v in per_level_w.items()},
        "high_recall": round(report["high"]["recall"], 4),
    }
    (ROOT / "artifacts").mkdir(exist_ok=True)
    (ROOT / "artifacts" / "threat_report.json").write_text(json.dumps(out, indent=1))
    MODEL.parent.mkdir(parents=True, exist_ok=True)
    dump({"model": clf, "levels": LEVELS, "features": FEATURES, "class_prior": prior.tolist()}, MODEL)
    print(json.dumps(out, indent=1))
    print(f"saved {MODEL}")


if __name__ == "__main__":
    main()
