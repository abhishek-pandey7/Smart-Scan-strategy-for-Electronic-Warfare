# Smart Scan Strategy for Electronic Warfare

A machine-learning Electronic Support (ES) receiver scheduler. It learns when and where to look in the spectrum without prior intelligence on emitters.

- Full design and PPT content: [`docs/SMART_SCAN_FULL_ARCHITECTURE.md`](docs/SMART_SCAN_FULL_ARCHITECTURE.md)
- Prototype scope: [`docs/SMART_SCAN_PROTOTYPE.md`](docs/SMART_SCAN_PROTOTYPE.md)
- Dataset findings: [`docs/DATASET_NOTES.md`](docs/DATASET_NOTES.md)
- Original plan: [`PLAN.md`](PLAN.md)

## What's in the prototype

| Part | Where |
|---|---|
| Receiver model (Turing replica: 36 centres, ±500 MHz, 2.15 s raster), scenarios, pulse-level truth | `primes/env`, `primes/core` |
| Learned emitter priors from 2,500 Turing training scenarios (HF API) | `primes/data/fit_priors.py` → `primes/assets/priors.json` |
| **Smart Scan**: periodic + Gilbert–Elliott track models, undiscovered-emitter belief with learned visibility, value-per-time index with information gain | `primes/predict`, `primes/policies/primes_lite.py` |
| Baselines: raster, random, hit-rate bandit, clairvoyant oracle | `primes/policies/baselines.py` |
| **Double-DQN** comparator (Stable-Baselines3) | `primes/rl` |
| Exact replay, metrics, multi-seed benchmark with bootstrap CIs | `primes/eval`, `experiments/benchmark.py` |
| FastAPI backend | `api/main.py` |
| Next.js frontend (mission replay, benchmark) | `web/` |

## Run it

Python 3.11+ and Node 20+.

```bash
pip install -r requirements.txt
pytest -q                                              # 20 tests

# optional: refit priors (needs HF access; the fitted file is committed)
python -m primes.data.fit_priors --split train_scan --limit 2500

# optional: train the Double-DQN comparator (~25 min on CPU)
python -m primes.rl.train_dqn --steps 600000

# benchmark all schedulers (writes artifacts/benchmark.json)
python -m experiments.benchmark --seeds 10 --workers 6

# backend + frontend
uvicorn api.main:app --port 8000
cd web && npm install && npm run dev                   # http://localhost:3000
```

Demo (mission page, all receivers at once):
`http://localhost:3000/mission?scenario=lockout`

Optional: point the Next.js rewrite at a non-default API with `SMARTSCAN_API_URL` (default `http://127.0.0.1:8000`).

Turing scenarios (`turing:<config>`) are fetched from Hugging Face on first use and need accepted access plus `huggingface-cli login`. They are stored under `data/raw/` (git-ignored).

## Branching

Every feature is developed on its own branch and merged into `main` by pull request.
