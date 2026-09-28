"use client";

import type { ReactNode } from "react";
import type { Explanation, PolicyRun, Scenario } from "@/lib/api";
import { EXTEND_MS, LAMBDA, MAX_EXTENSIONS, SEARCH_THRESHOLD, W_NEW, modeColor, type Mode } from "@/components/explain/modes";
import { DITHER, DWELLS_MS, TAU_MS, fmt, ghz, lastCatch, plug, type FlashIndex, type NextFlash } from "./derive";
import s from "./smartscan.module.css";

const C = { E: "var(--mode-track)", D: "var(--mode-search)", G: "var(--mode-extend)" } as const;

const Sym = ({ k, children }: { k: keyof typeof C; children: ReactNode }) => (
  <b className={s.sym} style={{ color: C[k] }}>{children}</b>
);
const Wn = () => <>W<sub>new</sub></>;

function Frac({ num, den }: { num: ReactNode; den: ReactNode }) {
  return (
    <span className={s.frac}>
      <span className={s.fracNum}>{num}</span>
      <span className={s.fracDen}>{den}</span>
    </span>
  );
}

export type EquationPanelProps = {
  ex?: Explanation; run: PolicyRun; scenario: Scenario; fx: FlashIndex; nexts: NextFlash[];
};

export default function EquationPanel({ ex, run, scenario, fx, nexts }: EquationPanelProps) {
  if (!ex) return <div className={s.panel}><p className="muted">t = 0: no decision yet. Press play or step →</p></div>;

  const p = plug(ex, W_NEW, LAMBDA);
  const extend = ex.mode === "extend";
  const search = ex.mode === "search";
  const showDither = search && Math.abs(p.dither - 1) > 1e-4;
  const centreIdx = scenario.centres_mhz.indexOf(ex.centre_mhz);
  const bars = [
    { k: "E" as const, label: <Sym k="E">E</Sym>, v: p.E, expr: fmt(p.E) },
    { k: "D" as const, label: <><Wn />·<Sym k="D">D</Sym></>, v: p.wD, expr: `${W_NEW.toFixed(1)} × ${fmt(p.D)}` },
    { k: "G" as const, label: <>λ·<Sym k="G">G</Sym></>, v: p.lG, expr: `${LAMBDA} × ${fmt(p.G)}` },
  ];

  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <span className={s.modeTag} style={{ background: modeColor(ex.mode) }}>{ex.mode.toUpperCase()}</span>
        <span className="mono">t = {ex.t.toFixed(3)} s</span>
        <span className={s.headMeta}>tracks {ex.tracks} · κ {ex.kappa}</span>
      </div>

      <div className={s.block}>
        <div className={s.formula}>
          <span className={s.lhs}>I(c,d) =</span>
          <Frac num={<><Sym k="E">E</Sym> + <Wn />·<Sym k="D">D</Sym> + λ·<Sym k="G">G</Sym></>} den={<>d + τ</>} />
          {search && <span className={s.op}>× (1 + {DITHER}·j)</span>}
        </div>
        {extend ? (
          <div className={s.formula}>
            <span className={s.lhs}>I =</span><span className={s.big}>–</span>
            <span className={s.dim}>fixed rule, not scored</span>
          </div>
        ) : (
          <div className={s.formula}>
            <span className={s.lhs}>I =</span>
            <Frac
              num={<><Sym k="E">{fmt(p.E)}</Sym> + {W_NEW.toFixed(1)}×<Sym k="D">{fmt(p.D)}</Sym> + {LAMBDA}×<Sym k="G">{fmt(p.G)}</Sym></>}
              den={<>{ex.dwell_ms} ms + {TAU_MS} ms</>} />
            {showDither && <span className={s.op}>× {p.dither.toFixed(3)}</span>}
            <span className={s.op}>=</span>
            <span className={s.big}>{fmt(p.index)}</span><span className={s.unit}>/s</span>
          </div>
        )}
      </div>

      <div className={s.bars} style={extend ? { opacity: 0.35 } : undefined}>
        {bars.map((b) => {
          const share = p.value > 0 ? b.v / p.value : 0;
          return (
            <div key={b.k} className={s.barRow}>
              <span className={s.barLabel}>{b.label}</span>
              <span className={s.barTrack}>
                <span className={s.barFill} style={{ width: `${100 * share}%`, minWidth: b.v > 0 ? 3 : 0, background: C[b.k] }} />
              </span>
              <span className={s.barExpr}>{b.expr}</span>
              <span className={s.barVal}>{fmt(b.v)}</span>
              <span className={s.barPct}>{(100 * share).toFixed(0)}%</span>
            </div>
          );
        })}
        <div className={s.barSum}>Σ = {fmt(p.value)} <span className={s.dim}>÷ {(p.dwellS).toFixed(3)} s = {fmt(p.raw)} /s</span></div>
      </div>

      <div className={s.rules}>
        <Rule mode="track" active={ex.mode}>
          {ex.mode === "track" && ex.track
            ? <>p·g = <b>{ex.track.p.toFixed(3)}</b> ≥ {SEARCH_THRESHOLD}</>
            : <>max p·g ≥ {SEARCH_THRESHOLD}</>}
        </Rule>
        <Rule mode="search" active={ex.mode}>max p·g &lt; {SEARCH_THRESHOLD}{search && <span className={s.dim}> · dither ×{p.dither.toFixed(3)}</span>}</Rule>
        <Rule mode="extend" active={ex.mode}>partial flash at end ∧ n &lt; {MAX_EXTENSIONS} → +{EXTEND_MS} ms</Rule>
      </div>

      <div className={s.choice}>
        <div className={s.choiceRow}>
          <span className={s.choiceKey}>c =</span>
          <b className="mono">{ghz(ex.centre_mhz)}</b>
          <span className={s.centres} aria-label={`centre ${centreIdx + 1} of ${scenario.centres_mhz.length}`}>
            {scenario.centres_mhz.map((_, i) => (
              <i key={i} className={i === centreIdx ? s.centreOn : undefined} style={i === centreIdx ? { background: modeColor(ex.mode) } : undefined} />
            ))}
          </span>
          <span className={s.dim}>{centreIdx + 1}/{scenario.centres_mhz.length}</span>
        </div>
        <div className={s.choiceRow}>
          <span className={s.choiceKey}>d =</span>
          <span className={s.chips}>
            {(extend ? [EXTEND_MS] : DWELLS_MS).map((d) => (
              <span key={d} className={s.chip} data-on={d === ex.dwell_ms || undefined}
                style={d === ex.dwell_ms ? { background: modeColor(ex.mode), borderColor: modeColor(ex.mode) } : undefined}>{d}</span>
            ))}
            <span className={s.dim}>ms</span>
          </span>
          {!extend && <span className={s.dim}>argmax over 36 × 5</span>}
        </div>
      </div>

      <NextFlashBlock ex={ex} run={run} fx={fx} nexts={nexts} />
    </div>
  );
}

function Rule({ mode, active, children }: { mode: Mode; active: Mode; children: ReactNode }) {
  const on = mode === active;
  return (
    <div className={s.rule} data-on={on || undefined} style={on ? { borderColor: modeColor(mode) } : undefined}>
      <span className={s.ruleArrow} style={{ color: modeColor(mode) }}>{on ? "▶" : ""}</span>
      <span className="mono">{children}</span>
      <span className={s.ruleMode} style={{ color: on ? modeColor(mode) : undefined }}>→ {mode.toUpperCase()}</span>
    </div>
  );
}

function NextFlashBlock({ ex, run, fx, nexts }: { ex: Explanation; run: PolicyRun; fx: FlashIndex; nexts: NextFlash[] }) {
  const tr = ex.track;
  let hero: ReactNode = null;
  if (tr) {
    const tNext = tr.next_flash_in_ms !== null ? ex.t + tr.next_flash_in_ms / 1000 : null;
    const last = lastCatch(run, fx, tr.emitter, ex.t);
    const T = tr.period_s;
    const k = T && last && tNext !== null ? Math.max(1, Math.round((tNext - last.t) / T)) : null;
    const exact = k !== null && last && T && tNext !== null && Math.abs(last.t + k * T - tNext) < 0.002;
    hero = (
      <div className={s.hero}>
        <div className={s.heroHead}>
          <b>#{tr.emitter}</b> {tr.model} · conf {tr.confidence.toFixed(2)} · T = <b className="mono">{T !== null ? `${T.toFixed(3)} s` : "–"}</b>
        </div>
        {tNext !== null ? (
          <div className="mono">
            t<sub>next</sub> = t<sub>last</sub> + k·T
            {k !== null && last && T ? <> {exact ? "=" : "≈"} {last.t.toFixed(3)} + {k}×{T.toFixed(3)}</> : null}
            {" "}= <b>{tNext.toFixed(3)} s</b> <span className={s.dim}>(in {tr.next_flash_in_ms!.toFixed(1)} ms)</span>
          </div>
        ) : <div className={s.dim}>on/off model: no period</div>}
      </div>
    );
  }
  const rows = nexts.filter((n) => n.emitter !== tr?.emitter).slice(0, tr ? 3 : 4);
  return (
    <div className={s.next}>
      <div className={s.blockTitle}>next flash · t<sub>next</sub> = t<sub>last</sub> + k·T</div>
      {hero}
      {rows.length > 0 ? (
        <table className={s.nextTable}>
          <thead><tr><th>#</th><th>T</th><th>t<sub>last</sub> + k·T</th><th>t<sub>next</sub></th><th>vs truth</th></tr></thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.emitter}>
                <td>{n.emitter}</td>
                <td>{n.T.toFixed(3)}</td>
                <td>{n.tLast !== null && n.k !== null ? `${n.tLast.toFixed(3)} + ${n.k}×T` : "–"}</td>
                <td><b>{n.tNext.toFixed(3)}</b>{n.extrapolated && <span className={s.dim}>*</span>}</td>
                <td>{n.truth !== null ? `${((n.tNext - n.truth) * 1e3).toFixed(1)} ms` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : !hero && <div className={s.dim}>no periodic track yet</div>}
    </div>
  );
}
