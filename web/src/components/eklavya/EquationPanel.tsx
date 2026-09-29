"use client";

import type { ReactNode } from "react";
import type { Explanation, PolicyRun } from "@/lib/api";
import { EXTEND_MS, LAMBDA, SEARCH_THRESHOLD, W_NEW, modeColor, type Mode } from "@/components/explain/modes";
import { DWELLS_MS, TAU_MS, fmt, ghz, lastCatch, plug, type FlashIndex } from "./derive";
import s from "./eklavya.module.css";

const C = { E: "var(--mode-track)", D: "var(--mode-search)", G: "var(--mode-extend)" } as const;

const MODE_TITLE: Record<Mode, string> = {
  track: "Catching a known radar",
  search: "Searching for new radars",
  extend: "Staying a little longer",
};

function Frac({ num, den }: { num: ReactNode; den: ReactNode }) {
  return (
    <span className={s.frac}>
      <span className={s.fracNum}>{num}</span>
      <span className={s.fracDen}>{den}</span>
    </span>
  );
}

export type EquationPanelProps = {
  ex?: Explanation; run: PolicyRun; fx: FlashIndex;
};

export default function EquationPanel({ ex, run, fx }: EquationPanelProps) {
  if (!ex) return <div className={s.panel}><p className="muted">No decision yet. Press Play.</p></div>;

  const p = plug(ex, W_NEW, LAMBDA);
  const extend = ex.mode === "extend";
  const tr = ex.track;
  const bars = [
    { k: "E" as const, label: "Catch a known radar", v: p.E },
    { k: "D" as const, label: "Find a new radar", v: p.wD },
    { k: "G" as const, label: "Learn its timing", v: p.lG },
  ];

  let why: ReactNode;
  if (ex.mode === "track" && tr) {
    why = <>Radar #{tr.emitter} is due to flash here, with a {(100 * tr.p).toFixed(0)}% chance of catching it. Anything above {(100 * SEARCH_THRESHOLD).toFixed(0)}% is worth going after.</>;
  } else if (ex.mode === "search") {
    why = <>No known radar is likely enough to be caught right now (all below {(100 * SEARCH_THRESHOLD).toFixed(0)}%), so it looks for new radars instead.</>;
  } else {
    why = <>It heard part of a flash just as the look ended, so it keeps listening {EXTEND_MS} ms more to catch the rest.</>;
  }

  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <span className={s.modeTag} style={{ background: modeColor(ex.mode) }}>{ex.mode.toUpperCase()}</span>
        <b className={s.modeTitle}>{MODE_TITLE[ex.mode]}</b>
        <span className={s.headMeta}>t = {ex.t.toFixed(2)} s</span>
      </div>
      <p className={s.why}>{why}</p>

      <div className={s.block}>
        <div className={s.blockTitle}>Where to listen: pick the highest score</div>
        {extend ? (
          <div className={s.formula}><span className={s.dim}>Not scored: a fixed rule finishes the flash it already heard.</span></div>
        ) : (
          <div className={s.formula}>
            <span className={s.lhs}>score =</span>
            <Frac num="expected value" den="time spent" />
            <span className={s.op}>=</span>
            <Frac num={fmt(p.value)} den={`${ex.dwell_ms + TAU_MS} ms`} />
            <span className={s.op}>=</span>
            <span className={s.big}>{fmt(p.raw)}</span><span className={s.unit}>/s</span>
          </div>
        )}
      </div>

      <div className={s.bars} style={extend ? { opacity: 0.35 } : undefined}>
        <div className={s.blockTitle}>What that value is made of</div>
        {bars.map((b) => {
          const share = p.value > 0 ? b.v / p.value : 0;
          return (
            <div key={b.k} className={s.barRow}>
              <span className={s.barLabel}>{b.label}</span>
              <span className={s.barTrack}>
                <span className={s.barFill} style={{ width: `${100 * share}%`, minWidth: b.v > 0 ? 3 : 0, background: C[b.k] }} />
              </span>
              <span className={s.barPct}>{(100 * share).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      <div className={s.choice}>
        <div className={s.blockTitle}>Chosen look</div>
        <div className={s.choiceRow}>
          <span className={s.choiceKey}>Tune to</span>
          <b className="mono">{ghz(ex.centre_mhz)}</b>
        </div>
        <div className={s.choiceRow}>
          <span className={s.choiceKey}>Listen for</span>
          <span className={s.chips}>
            {(extend ? [EXTEND_MS] : DWELLS_MS).map((d) => (
              <span key={d} className={s.chip} data-on={d === ex.dwell_ms || undefined}
                style={d === ex.dwell_ms ? { background: modeColor(ex.mode), borderColor: modeColor(ex.mode) } : undefined}>{d}</span>
            ))}
            <span className={s.dim}>ms</span>
          </span>
        </div>
      </div>

      <NextFlashBlock ex={ex} run={run} fx={fx} />
    </div>
  );
}

function NextFlashBlock({ ex, run, fx }: { ex: Explanation; run: PolicyRun; fx: FlashIndex }) {
  const tr = ex.track;
  if (!tr) return null;
  const tNext = tr.next_flash_in_ms !== null ? ex.t + tr.next_flash_in_ms / 1000 : null;
  const last = lastCatch(run, fx, tr.emitter, ex.t);
  const T = tr.period_s;
  return (
    <div className={s.next}>
      <div className={s.blockTitle}>Predicting radar #{tr.emitter}</div>
      <div className={s.hero}>
        {T !== null && tNext !== null ? (
          <>
            <div>Flashes every <b className="mono">{T.toFixed(2)} s</b>{last && <> · last caught at <b className="mono">{last.t.toFixed(2)} s</b></>}</div>
            <div>Next flash expected at <b className="mono">{tNext.toFixed(2)} s</b> <span className={s.dim}>(in {tr.next_flash_in_ms!.toFixed(0)} ms)</span></div>
          </>
        ) : <div className={s.dim}>Switches on and off irregularly, so there is no fixed rhythm to predict.</div>}
      </div>
    </div>
  );
}
