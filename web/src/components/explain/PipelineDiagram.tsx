import { MODES, MODE_LABEL, modeColor, type Mode } from "./modes";
import s from "./explain.module.css";

const W = 1240, H = 290, BOX_W = 200, BOX_H = 150, GAP = 50, TOP = 16;
const xOf = (i: number) => 20 + i * (BOX_W + GAP);

type Stage = { step: string; title: string; lines: string[] };
const STAGES: Stage[] = [
  { step: "1", title: "Observe", lines: ["Tune one 1 GHz slice", "for 5–100 ms and hear", "pulses or silence"] },
  { step: "2", title: "Update tracks", lines: ["Periodic flash model vs", "on/off Markov model,", "priors from Turing data"] },
  { step: "3", title: "Score every look", lines: ["36 slices × 5 dwells:", "(exploit + discovery", "+ λ·info gain) ÷ dwell"] },
  { step: "4", title: "Mode", lines: [] },
  { step: "5", title: "Act", lines: ["Listen at the top-", "scoring look and log", "why it was chosen"] },
];

export type PipelineDiagramProps = {
  /** Highlights one mode, e.g. the decision at the playback cursor. */
  activeMode?: Mode | null;
  /** Disables the flowing-arrow animation. */
  static?: boolean;
};

export default function PipelineDiagram({ activeMode = null, static: still = false }: PipelineDiagramProps) {
  const flow = still ? undefined : s.flow;
  const midY = TOP + BOX_H / 2;
  const loopY = TOP + BOX_H + 56;
  const first = xOf(0) + BOX_W / 2, last = xOf(4) + BOX_W / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={s.pipeline} role="img"
      aria-label="Decision loop: observe, update tracks, score every look, pick the mode (search, track or extend), act, then observe again">
      <defs>
        <marker id="pd-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--axis)" />
        </marker>
      </defs>

      {STAGES.slice(0, -1).map((_, i) => (
        <line key={i} x1={xOf(i) + BOX_W + 4} x2={xOf(i + 1) - 6} y1={midY} y2={midY}
          stroke="var(--axis)" strokeWidth={2.5} className={flow} markerEnd="url(#pd-arrow)" />
      ))}
      <path d={`M${last} ${TOP + BOX_H + 4} V${loopY} H${first} V${TOP + BOX_H + 8}`} fill="none"
        stroke="var(--axis)" strokeWidth={2.5} className={flow} markerEnd="url(#pd-arrow)" />
      <rect x={W / 2 - 250} y={loopY - 13} width={500} height={26} rx={13} fill="var(--page)" />
      <text x={W / 2} y={loopY + 5} textAnchor="middle" fontSize={15} fill="var(--text-secondary)">
        The result (hit or miss) feeds the next decision, every few milliseconds
      </text>

      {STAGES.map((st, i) => {
        const x = xOf(i), isMode = i === 3;
        return (
          <g key={st.title}>
            <rect x={x} y={TOP} width={BOX_W} height={BOX_H} rx={14} fill="var(--surface-1)"
              stroke={isMode && activeMode ? modeColor(activeMode) : "var(--border-strong)"} strokeWidth={isMode && activeMode ? 2.5 : 1.5} />
            <text x={x + 18} y={TOP + 32} fontSize={13} fontWeight={650} fill="var(--accent)" fontFamily="var(--font-num)">{st.step}</text>
            <text x={x + 36} y={TOP + 32} fontSize={18} fontWeight={650} fill="var(--text-primary)">{st.title}</text>
            {st.lines.map((line, k) => (
              <text key={k} x={x + 18} y={TOP + 66 + k * 23} fontSize={15} fill="var(--text-secondary)">{line}</text>
            ))}
            {isMode && MODES.map((m, k) => {
              const on = activeMode === m, y = TOP + 48 + k * 32;
              return (
                <g key={m}>
                  <rect x={x + 18} y={y} width={BOX_W - 36} height={26} rx={13} className={s.pill}
                    fill={on ? modeColor(m) : "var(--surface-2)"} stroke={modeColor(m)} strokeWidth={on ? 0 : 1.5} />
                  {!on && <circle cx={x + 36} cy={y + 13} r={5} fill={modeColor(m)} />}
                  <text x={on ? x + BOX_W / 2 : x + 50} y={y + 18} fontSize={14} fontWeight={600}
                    textAnchor={on ? "middle" : "start"} fill={on ? "#fff" : "var(--text-primary)"}>{MODE_LABEL[m]}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
