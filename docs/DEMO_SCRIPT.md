# Smart Scan demo: click path for the video

Target length: about 4 minutes. Record at 1920x1080, browser zoom 100%, light mode.

## Before recording

1. API from the repo root: `uvicorn api.main:app --reload --port 8000`
2. Web: `cd web && npm run dev` (open the URL it prints: port 3000, or 3001 if 3000 is taken)
3. Warm the cache so nothing waits on camera: `python -m scripts.warm_cache`
   - Rerun this after `artifacts/models/dqn.zip` exists. Until then Double-DQN is left out of the lineup automatically.
4. Click through every page once before recording. The first How it decides replay for each scenario is slow (20 s to 2 min) and is cached after that.

## 1. Overview (`/`), about 40 s

- **Say:** "Radars flash for milliseconds, and a receiver can only listen to one slice of spectrum at a time. So every look is a bet."
- **Point at the hero graphic:** in the top panel, the fixed sweep misses most flashes. In the bottom panel, Smart Scan searches briefly, then sits on each radar's predicted flash.
- **Scroll to "Why scanning is hard":** read the third card, "A fixed sweep gets locked out". This sets up the mission.
- **Scroll to "The lineup":** Smart Scan (learned models), Double-DQN (reinforcement learning), Greedy, Raster and Random (classical), and Oracle (reference, upper bound). "All six run against the same radars."
- Click **Run the mission**.

## 2. Mission (`/mission`), about 90 s

- Pick the **Lock-out** card. **Say:** "Four of these six radars rotate in step with the fixed sweep, so their flashes always land between its visits."
- Click **Run all receivers** (it's cached, so it returns instantly).
- **Live race (leaderboard):** let it play. Smart Scan pulls ahead early. Raster stays near zero.
- **Where each receiver listened (spectrum grid):** point at the Raster lane, where the diagonal sweep lines keep missing the grey flash marks. Then point at the Smart Scan lane, where its dots line up on each radar's frequency.
- **Cumulative flashes caught:** Oracle is the dashed line (the ceiling). Point at the gap between Smart Scan and everyone else.
- **What it decided just now:** pause the playbar and read the mode badge (Searching / Tracking / Extending), the frequency, the dwell and the three score bars.
- **Who wins what:** read the winner badges and the scorecard. Seed-0 Lock-out numbers for flashes caught: Smart Scan 50%, Double-DQN 18%, Greedy 7%, Random 4%, Raster under 1%, Oracle 99% (reference, so it is left out of the winner badges).
- Click **How it decides →**. This opens the same run.

## 3. How it decides (`/how-it-decides`), about 70 s

- **Say:** "It isn't a black box, and it isn't a stack of algorithms. It's one predict-then-score loop." Point at the three callout cards.
- **Five steps per decision (pipeline):** Observe, then update tracks, then score every (frequency, dwell) as value per second, then pick the mode, then act. The highlighted mode follows the cursor.
- **Watch it decide:** click **Track decision**. The score breakdown shows exploit dominating, because the look lands just before a predicted flash. Click **Search decision** to show discovery dominating. Click **Extend decision** (if present) and explain "heard something, stay 5 ms longer".
- **Mode over time:** drag across the timeline. Search dominates early, then track looks cluster once radars are learned.
- **Models used / Double-DQN:** "The rival learns from reward alone, with no radar model." Point at the training curve, then the side-by-side comparison card.

## 4. Benchmark (`/benchmark`), about 40 s

- **Say:** "One run is an anecdote. This is many seeds per scenario with 95% confidence intervals."
- **Winner strip:** toggle **This scenario / Overall**.
- Click the scenario tabs (Lock-out, then Dense), keeping the metric on **Flashes intercepted**. Smart Scan is highlighted in the interval plot.
- Optionally open **Ablations** to show that removing the learned priors or the information-gain term costs performance.
- Close: "Learn the rhythm, predict the flash, listen where it pays."

## Fallbacks

- If Double-DQN is missing from the lineup, say "the reinforcement learning comparator is shown on the benchmark and How it decides pages" and carry on.
- The real-dataset (Turing) card only appears when local Turing configs exist. Skip it otherwise.
