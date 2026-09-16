"""Load a Turing stare-mode scenario as pulse-level truth."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from primes.core.types import EmitterInfo, Truth
from primes.threat.taxonomy import threat_level

REPO_ID = "alan-turing-institute/turing-synthetic-radar-dataset"
RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
COLLECTION_S = 30.0


def stare_path(config: int, split: str = "val_stare") -> Path:
    """Local path to a stare file, fetching it from Hugging Face on first use."""
    local = RAW_DIR / "stare" / split / f"config_{config}.h5"
    if not local.exists():
        from huggingface_hub import hf_hub_download

        hf_hub_download(REPO_ID, f"stare/{split}/config_{config}.h5", repo_type="dataset",
                        local_dir=str(RAW_DIR))
    return local


def available_configs(split: str = "val_stare") -> list[int]:
    return sorted(int(p.stem.split("_")[1]) for p in (RAW_DIR / "stare" / split).glob("config_*.h5"))


def load_stare(config: int, split: str = "val_stare") -> Truth:
    import h5py

    with h5py.File(stare_path(config, split), "r") as f:
        data, labels = f["data"][:], f["labels"][:, 0].astype(np.int32)
        infos = []
        txs = f["metadata/transmitters"]
        for name in sorted(txs, key=lambda s: int(s.split("_")[1])):
            tx = txs[name]
            scan = tx["scan_config"].attrs
            rpm, bw = float(scan["scan_rate_rpm"]), float(scan["beam_width_deg"])
            circular = scan["scan_type"] == "Circular" and rpm > 0
            period = 60.0 / rpm if circular else None
            infos.append(EmitterInfo(
                id=int(name.split("_")[1]), kind="circular" if circular else "omni",
                freqs_mhz=[float(x) for x in tx["frequency_config"]["freqs_mhz"][()]],
                period_s=period, flash_s=period * bw / 360.0 if circular else None,
                label=str(tx.attrs.get("function", "")),
                threat=threat_level(str(tx.attrs.get("function", "")))))

    toa = data[:, 0].astype(np.float64) * 1e-6
    keep = (toa >= 0) & (toa < COLLECTION_S)
    order = np.argsort(toa[keep], kind="stable")
    present = set(np.unique(labels[keep]).tolist())
    return Truth(name=f"turing:val_stare/config_{config}", horizon_s=COLLECTION_S,
                 toa=toa[keep][order], freq=data[keep, 1][order].astype(np.float32),
                 emitter=labels[keep][order], emitters=[e for e in infos if e.id in present],
                 pw=data[keep, 2][order].astype(np.float32))
