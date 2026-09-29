# Ekalavya demo: timed run-sheet

Target length **2:30** (the previous cut ran 4:00). Record at 1920x1080, browser
zoom 100%, light mode. One take per section is fine — the sections are cut apart
in edit, so a fumble means redoing one section, not the whole video.

Pace assumption throughout: **150 words per minute = 2.5 words per second.** Every
line below carries its word count, so the timings are checkable rather than
guessed. If a line runs long on camera, cut words — do not speed up.

## Before recording

Record against the **live site: https://ekalavya-arvada.pages.dev** — not `npm run
dev`. The deployed site is static: every replay is precomputed, so nothing spins,
nothing waits on the camera, and there is no backend to start. The old setup
(uvicorn + `npm run dev` + `warm_cache`) is only needed when demoing unbaked
scenarios.

Open every page once before rolling so the browser has the JSON cached.

## The budget

| # | Section | Clock | Seconds | Words |
|---|---------|-------|---------|-------|
| 1 | Landing — quick scroll | 0:00–0:15 | 15 | ~35 |
| 2 | Mission — the race | 0:15–1:10 | 55 | ~95 |
| 3 | How it decides — the loop | 1:10–1:50 | 40 | ~70 |
| 4 | Benchmark — the evidence | 1:50–2:20 | 30 | ~55 |
| 5 | Close | 2:20–2:30 | 10 | ~15 |
|   | **Total** | | **150** | **~270** |

`HOLD` below means: stop moving the mouse, stop scrolling, say nothing, let the
screen play. Those are deliberate — they give the edit room to breathe and they
are where the animation does the explaining.

## 1. Landing (`/`) — 0:00–0:15

Not a tour. One continuous slow scroll from hero to footer; the cards read
themselves in passing. Do **not** stop on "Why scanning is hard" or "The lineup".

- **0:00–0:05** Open on the hero graphic. HOLD 2 s, then start scrolling.
  > "Radars flash for milliseconds, and a receiver can only listen to one slice of
  > spectrum at a time. So every look is a bet." *(28 w, 11 s)*
- **0:05–0:13** Keep the scroll moving at a steady, readable speed — about 8
  seconds top to bottom.
  > "Ekalavya learns when each radar will flash, and listens there." *(10 w, 4 s)*
- **0:13–0:15** Land on **Run the mission** and click it.

## 2. Mission (`/mission`) — 0:15–1:10

- **0:15–0:24 (9 s)** — Click the **Lock-out** card, then **Run all receivers**
  (cached, returns instantly).
  > "Lock-out: four of these six radars rotate in step with a fixed sweep, so
  > their flashes always land between its visits." *(21 w, 8 s)*
- **0:24–0:40 (16 s)** — **Live leaderboard.** Let it play.
  > "Six receivers, same radars, same time budget." *(7 w, 3 s)*
  > **HOLD 13 s** — no cursor, no talking. Ekalavya pulling ahead while Raster
  > sits at zero is the whole argument; let the viewer watch it happen.
- **0:40–0:52 (12 s)** — **Where each receiver listened.** Cursor on the Raster
  lane first, then the Ekalavya lane.
  > "Raster sweeps a diagonal and keeps missing the flashes. Ekalavya's looks sit
  > on each radar's frequency, just before it fires." *(24 w, 10 s)*
- **0:52–1:02 (10 s)** — **Cumulative flashes caught.** Trace the gap with the
  cursor.
  > "The dashed line is the oracle — the ceiling if you knew everything in
  > advance. Mind the gap between Ekalavya and the rest." *(24 w, 10 s)*
- **1:02–1:10 (8 s)** — **Who wins what.** Cursor on the scorecard.
  > "Fifty percent of flashes caught. Double-DQN eighteen. Raster under one."
  > *(11 w, 5 s)* — then **HOLD 3 s** on the numbers.

**Cut from the old script:** "What it decided just now". The same decision panel
is covered properly in section 3; showing it twice cost 15 s and taught nothing
new.

## 3. How it decides (`/how-it-decides`) — 1:10–1:50

This is the section that ran long last time. The fix is not to talk faster — it
is to **stop reading the page aloud**. The three callout cards, the Models-used
grid and the training curve are all on screen for anyone who pauses. Say the one
thing the screen cannot say, then HOLD.

- **1:10–1:16 (6 s)** — Arrive and scroll past the three callout cards without
  stopping on them.
  > "This isn't a black box, and it isn't a stack of algorithms. It's one
  > predict-then-score loop." *(16 w, 6 s)*
- **1:16–1:28 (12 s)** — **Five steps per decision.** Drag the cursor slowly
  across the strip, one step per second.
  > "Observe. Update the tracks. Score every frequency-and-dwell pair as value per
  > second. Pick the mode. Act." *(17 w, 7 s)*
  > **HOLD 5 s** — finish the drag in silence so the highlight is readable.
- **1:28–1:42 (14 s)** — **Watch it decide.** Two clicks, nothing else.
  - Click **Track decision**. > "Exploit dominates — the look lands just before a
    predicted flash." *(11 w, 4 s)* **HOLD 3 s** on the score bars.
  - Click **Search decision**. > "Discovery dominates — this look is buying
    information." *(9 w, 4 s)* **HOLD 3 s**.
  - Skip **Extend** unless the take is running short.
- **1:42–1:50 (8 s)** — **Mode over time.** Drag once across the timeline, left
  to right.
  > "Search early, then track looks cluster once the radars are learned. The rival
  > learns from reward alone, with no radar model." *(23 w, 9 s)*

**Cut from the old script:** reading the three callout cards, the Models-used
walkthrough, and the Double-DQN training curve. Thirty seconds of theory, reduced
to one clause inside the line above.

## 4. Benchmark (`/benchmark`) — 1:50–2:20

- **1:50–1:58 (8 s)** — Land on the winner strip.
  > "One run is an anecdote. This is many seeds per scenario, with ninety-five
  > percent confidence intervals." *(16 w, 7 s)*
- **1:58–2:10 (12 s)** — Click the **Lock-out** tab, then **Dense**. Leave the
  metric on **Flashes intercepted**.
  > "Same story across scenarios, and the intervals don't overlap." *(9 w, 4 s)*
  > **HOLD 7 s** on the interval plot with Ekalavya highlighted.
- **2:10–2:20 (10 s)** — Open **Ablations**.
  > "Take away the learned priors, or the information-gain term, and the
  > performance goes with them. The learning is doing the work." *(22 w, 9 s)*

## 5. Close — 2:20–2:30

Scroll back to the hero, or hold on the winner strip.

> "Learn the rhythm, predict the flash, listen where it pays." *(10 w, 4 s)*

**HOLD 6 s** on the final frame — dead air at the end gives the edit somewhere to
put the title card and the URL.

## Fallbacks

- The deployed catalog offers Easy, Lock-out, Pop-up, Dense, Mixed and the Turing
  scenarios that were baked. Anything not in the picker has no precomputed run.
- If a panel renders empty, hard-refresh once: it is a cached JSON fetch, not a
  backend failure. There is no backend.
