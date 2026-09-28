"use client";

import { Badge } from "@/components/ui";
import { itemAtCursor, type Explanation } from "@/lib/api";
import { DITHER_PCT, EXTEND_MS, LAMBDA, MODE_VERB, SEARCH_THRESHOLD, W_NEW, modeColor } from "./modes";
import s from "./explain.module.css";

const TERMS = [
  { key: "exploit", label: "Exploit", color: "var(--mode-track)", hint: "expected flashes caught from emitters already tracked" },
  { key: "discovery", label: "Discovery", color: "var(--mode-search)", hint: `${W_NEW} × expected new emitters found` },
  { key: "info_gain", label: "Info gain", color: "var(--mode-extend)", hint: `λ = ${LAMBDA} × bits learned about flash timing` },
] as const;

const fmt = (v: number) => (v === 0 ? "0" : Math.abs(v) < 0.001 ? v.toExponential(1) : v.toFixed(3));

export type ScoreBreakdownProps = { explanations: Explanation[]; cursor: number };

export default function ScoreBreakdown({ explanations, cursor }: ScoreBreakdownProps) {
  const ex = itemAtCursor(explanations, cursor);
  if (!ex) return <p className="muted">No decision yet. Press play or click the timeline.</p>;

  const extend = ex.mode === "extend";
  const value = ex.terms.exploit + ex.terms.discovery + ex.terms.info_gain;
  const perSecond = value / (ex.dwell_ms / 1000);
  const max = Math.max(ex.terms.exploit, ex.terms.discovery, ex.terms.info_gain, 1e-9);

  return (
    <div className="stack-sm" style={{ gap: 14 }}>
      <div className="hstack" style={{ gap: 10 }}>
        <Badge size="md" dot={modeColor(ex.mode)}>{MODE_VERB[ex.mode]}</Badge>
        <span className="mono">t = {ex.t.toFixed(2)} s</span>
        <span className="muted">·</span>
        <span>listen at <strong className="mono">{(ex.centre_mhz / 1000).toFixed(2)} GHz</strong></span>
        <span>for <strong className="mono">{ex.dwell_ms.toFixed(0)} ms</strong></span>
      </div>

      <p style={{ margin: 0 }}>
        {extend && <>The last look heard part of a flash at its very end, so the receiver stays on the same frequency for another {EXTEND_MS} ms instead of scoring a new look.</>}
        {ex.mode === "track" && ex.track && (
          <>
            The most catchable tracked emitter, <strong>#{ex.track.emitter}</strong>, is modelled as{" "}
            {ex.track.model === "periodic" && ex.track.period_s
              ? <>a rotating radar with period ≈ <strong className="mono">{ex.track.period_s.toFixed(3)} s</strong></>
              : <>an intermittent (on/off) emitter</>}
            {ex.track.next_flash_in_ms !== null ? <>, next flash due in <strong className="mono">{ex.track.next_flash_in_ms.toFixed(0)} ms</strong></> : null}.
            Its catch chance, weighted by time since last heard, is <strong className="mono">{ex.track.p.toFixed(2)}</strong> (≥ {SEARCH_THRESHOLD}), so this is a tracking look.
          </>
        )}
        {ex.mode === "track" && !ex.track && <>A known emitter&apos;s catch chance is at least {SEARCH_THRESHOLD}, so this is a tracking look.</>}
        {ex.mode === "search" && <>No tracked emitter is likely enough to be caught right now (every catch chance is below {SEARCH_THRESHOLD}), so the best look is the one most likely to find something new.</>}
      </p>

      <div className={s.terms} style={extend ? { opacity: 0.4 } : undefined} aria-disabled={extend}>
        {TERMS.map((term) => {
          const v = ex.terms[term.key];
          return (
            <div key={term.key} className={s.term}>
              <span>{term.label}<span className={s.termHint}>{term.hint}</span></span>
              <span className={s.termTrack}>
                <span className={s.termFill} style={{ width: `${(100 * v) / max}%`, minWidth: v > 0 ? 3 : 0, background: term.color }} />
              </span>
              <span className={s.termValue}>{fmt(v)}</span>
            </div>
          );
        })}
      </div>

      {extend ? (
        <div className={s.formula}>No score: extending is a fixed rule of the micro dwell controller, applied before scoring.</div>
      ) : (
        <div className={s.formula}>
          <span>value</span><strong>{fmt(value)}</strong>
          <span>÷ dwell</span><strong>{(ex.dwell_ms / 1000).toFixed(3)} s</strong>
          <span>=</span><strong>{perSecond.toFixed(2)}</strong><span>per second</span>
          <span className="muted" style={{ flexBasis: "100%", fontSize: 13 }}>
            The highest value per second of listening wins, out of 36 frequencies × 5 dwells.
            {ex.mode === "search" && ` Logged score ${ex.index.toFixed(2)} includes the ±${DITHER_PCT} % search dither.`}
          </span>
        </div>
      )}

      <p className="muted small" style={{ margin: 0 }}>
        {ex.tracks} emitter tracks · visibility factor κ = {ex.kappa} (learned online: how much more or less often
        undiscovered emitters show up than the prior predicted)
      </p>
    </div>
  );
}
