# Smart Scan Strategy for Electronic Warfare — PRIMES

**P**redictive **R**estless **I**ndex for **M**ultiband **E**lectronic **S**upport: a machine-learning Electronic Support (ES) receiver scheduler. It learns when and where to look in the spectrum without prior intelligence on emitters.

The full design, trade study, phases and verification plan are in [`PLAN.md`](PLAN.md).

## Data

This project uses the [Turing Synthetic Radar Dataset](https://huggingface.co/datasets/alan-turing-institute/turing-synthetic-radar-dataset) (Apache-2.0, gated). Request access on Hugging Face, run `huggingface-cli login`, then download files into `data/raw/`. That folder is git-ignored.

## Branching

Every feature is developed on its own branch and merged into `main` by pull request.
