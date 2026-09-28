import type { ReactNode } from "react";
import { DITHER_PCT, EXTEND_MS, LAMBDA, SEARCH_THRESHOLD, W_NEW } from "@/components/explain/modes";
import { DWELLS_MS, STALE_S, TAU_MS } from "./derive";
import s from "./eklavya.module.css";

const ROWS: [ReactNode, ReactNode][] = [
  ["I(c,d)", "score = value per second of listening; highest wins"],
  ["c", "centre frequency · 36 options, hears ±0.5 GHz"],
  ["d", `dwell · ${DWELLS_MS.join(", ")} ms`],
  ["τ", `retune cost · ${TAU_MS} ms in these replays`],
  [<b key="E" style={{ color: "var(--mode-track)" }}>E</b>, "exploit · Σ tracks cover · g · P(catch)"],
  [<b key="D" style={{ color: "var(--mode-search)" }}>D</b>, "discovery · expected new emitters found"],
  [<b key="G" style={{ color: "var(--mode-extend)" }}>G</b>, "info gain · bits learned about flash timing"],
  [<span key="w">W<sub>new</sub>, λ</span>, `weights · ${W_NEW.toFixed(1)}, ${LAMBDA}`],
  ["p·g", `best track: P(catch) × g · Track if ≥ ${SEARCH_THRESHOLD}`],
  ["g", `staleness · min(1, Δt since heard / ${STALE_S} s)`],
  ["j", `golden-ratio dither, search only · ×(1 ± ${DITHER_PCT}%)`],
  ["T, k", "period · flashes ahead of last catch"],
  ["t̂", "predicted flash (ring on the spectrum)"],
  ["κ", "visibility of undiscovered emitters, learned"],
  ["extend", `partial flash heard → stay +${EXTEND_MS} ms`],
];

export default function SymbolLegend() {
  return (
    <dl className={s.legend}>
      {ROWS.map(([sym, text], i) => (
        <div key={i} className={s.legendRow}>
          <dt>{sym}</dt><dd>{text}</dd>
        </div>
      ))}
    </dl>
  );
}
