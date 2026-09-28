import { indexAtOrBefore, type Explanation, type PolicyRun, type Scenario } from "@/lib/api";
import type { Mode } from "@/components/explain/modes";

/** Dwell options of the scheduler (primes_lite.PRIMES_DWELLS_S), in ms. */
export const DWELLS_MS = [5, 10, 25, 50, 100] as const;
/** Retune cost in the index; 0 in every replay served by the API. */
export const TAU_MS = 0;
/** Golden-ratio dither amplitude in search mode: index × (1 + 0.10·j), j ∈ [−0.5, 0.5). */
export const DITHER = 0.1;
/** Staleness horizon: g = min(1, Δt / STALE_S). */
export const STALE_S = 2;

export function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a < 1e-3) return v.toExponential(1);
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

export const ghz = (mhz: number) => `${(mhz / 1000).toFixed(2)} GHz`;

/** The numbers behind one scored decision, recovered from the logged terms. */
export type Plugged = {
  E: number; D: number; G: number;          // raw exploit, discovery, info gain
  wD: number; lG: number;                   // weighted: W_new·D, λ·G (as logged)
  value: number; dwellS: number; raw: number; dither: number; index: number;
};

export function plug(ex: Explanation, wNew: number, lambda: number): Plugged {
  const E = ex.terms.exploit, wD = ex.terms.discovery, lG = ex.terms.info_gain;
  const value = E + wD + lG;
  const dwellS = (ex.dwell_ms + TAU_MS) / 1000;
  const raw = value / dwellS;
  const dither = ex.mode === "search" && raw > 0 ? ex.index / raw : 1;
  return { E, D: wD / wNew, G: lG / lambda, wD, lG, value, dwellS, raw, dither, index: ex.index };
}

export type SecondCell = {
  s: number; n: number; share: Record<Mode, number>; maxI: number | null; catches: number; trackAt: number | null;
};

export function perSecond(ex: Explanation[], intercepts: PolicyRun["intercepts"], horizon: number): SecondCell[] {
  const n = Math.ceil(horizon - 1e-9);
  const cells: SecondCell[] = Array.from({ length: n }, (_, s) => ({
    s, n: 0, share: { search: 0, track: 0, extend: 0 }, maxI: null, catches: 0, trackAt: null,
  }));
  for (const e of ex) {
    const c = cells[Math.min(n - 1, Math.floor(e.t))];
    if (!c) continue;
    c.n++;
    c.share[e.mode]++;
    if (e.mode !== "extend" && (c.maxI === null || e.index > c.maxI)) c.maxI = e.index;
    if (e.mode === "track" && c.trackAt === null) c.trackAt = e.t;
  }
  for (const [t] of intercepts) {
    const c = cells[Math.min(n - 1, Math.floor(t))];
    if (c) c.catches++;
  }
  for (const c of cells) if (c.n) for (const m of ["search", "track", "extend"] as Mode[]) c.share[m] /= c.n;
  return cells;
}

export type FlashIndex = {
  start: Map<string, number>;               // "emitter:k" -> truth flash start
  freq: Map<string, number>;                // "emitter:k" -> truth flash frequency
  starts: Map<number, number[]>;            // emitter -> sorted flash starts
};

export function indexFlashes(scenario: Scenario): FlashIndex {
  const start = new Map<string, number>(), freq = new Map<string, number>(), starts = new Map<number, number[]>();
  for (const [e, k, s, , f] of scenario.flashes.rows) {
    start.set(`${e}:${k}`, s);
    freq.set(`${e}:${k}`, f);
    const arr = starts.get(e);
    if (arr) arr.push(s); else starts.set(e, [s]);
  }
  return { start, freq, starts };
}

/** Start (truth) and frequency of the latest flash of `emitter` caught and already started by time t. */
export function lastCatch(run: PolicyRun, fx: FlashIndex, emitter: number, t: number) {
  let best: { t: number; freq: number | null } | null = null;
  for (const [tHit, e, k] of run.intercepts) {
    if (tHit > t + 1e-9) break;
    if (e !== emitter) continue;
    const start = fx.start.get(`${e}:${k}`) ?? tHit;
    if (start <= t + 1e-9) best = { t: start, freq: fx.freq.get(`${e}:${k}`) ?? null };
  }
  return best;
}

export type NextFlash = {
  emitter: number; T: number; tLast: number | null; k: number | null; tNext: number;
  extrapolated: boolean; truth: number | null; freq: number | null;
};

/** Model's next-flash prediction per periodic track at time t (latest logged prediction, rolled forward by T). */
export function nextFlashes(run: PolicyRun, scenario: Scenario, fx: FlashIndex, t: number): NextFlash[] {
  const period = new Map<number, number>();
  for (const [tt, e, T] of run.tracks) {
    if (tt > t) break;
    if (T !== null && T > 0) period.set(e, T); else period.delete(e);
  }
  const pred = new Map<number, number>();
  for (const p of run.predictions) {
    if (p.t > t) break;
    pred.set(p.emitter, p.predicted);
  }
  const out: NextFlash[] = [];
  for (const [e, p0] of pred) {
    const T = period.get(e);
    if (!T) continue;
    let tNext = p0, extrapolated = false;
    if (tNext < t) { tNext += Math.ceil((t - tNext) / T) * T; extrapolated = true; }
    const last = lastCatch(run, fx, e, t);
    const k = last ? Math.max(1, Math.round((tNext - last.t) / T)) : null;
    const starts = fx.starts.get(e) ?? [];
    const i = indexAtOrBefore(starts, tNext + T / 2);
    const truth = i >= 0 && Math.abs(starts[i] - tNext) < T / 2 ? starts[i] : null;
    const freq = last?.freq ?? scenario.emitters.find((x) => x.id === e)?.freqs_mhz[0] ?? null;
    out.push({ emitter: e, T, tLast: last?.t ?? null, k, tNext, extrapolated, truth, freq });
  }
  return out.sort((a, b) => a.tNext - b.tNext);
}
