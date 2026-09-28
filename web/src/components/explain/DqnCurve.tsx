import type { DqnCurve as Curve } from "@/lib/api";
import s from "./explain.module.css";

const W = 600, H = 260, PAD = { left: 48, right: 16, top: 16, bottom: 36 };

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}
const kSteps = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`);

export default function DqnCurve({ curve }: { curve: Curve | null }) {
  if (!curve || curve.timesteps.length === 0) {
    return (
      <div className="notice">
        No training curve yet. It appears here once the Double-DQN comparator has been trained and evaluated
        on the validation scenarios.
      </div>
    );
  }
  const { timesteps: xs, mean_reward: ys } = curve;
  const xMax = Math.max(...xs), yMax = niceMax(Math.max(...ys, 1));
  const best = ys.indexOf(Math.max(...ys));
  const pw = W - PAD.left - PAD.right, ph = H - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + (v / xMax) * pw;
  const y = (v: number) => PAD.top + (1 - v / yMax) * ph;
  const d = xs.map((v, i) => `${i ? "L" : "M"}${x(v).toFixed(1)},${y(ys[i]).toFixed(1)}`).join("");
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xTicks = xs.length <= 8 ? xs : xs.filter((_, i) => i % Math.ceil(xs.length / 8) === 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
        aria-label={`Double-DQN validation reward over ${kSteps(xMax)} training steps, best ${ys[best].toFixed(1)}`}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={PAD.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--text-muted)"
              fontFamily="var(--font-num)">{Math.round(v)}</text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={x(v)} y={H - PAD.bottom + 18} textAnchor="middle" fontSize={11} fill="var(--text-muted)"
            fontFamily="var(--font-num)">{kSteps(v)}</text>
        ))}
        <text x={PAD.left + pw / 2} y={H - 4} textAnchor="middle" fontSize={12} fill="var(--text-secondary)">training steps (one step = one 25 ms look)</text>
        <path d={d} fill="none" stroke="var(--series-dqn)" strokeWidth={2.5} strokeLinejoin="round" />
        {xs.map((v, i) => (
          <circle key={v} cx={x(v)} cy={y(ys[i])} r={i === best ? 6 : 3.5} fill={i === best ? "var(--series-dqn)" : "var(--surface-1)"}
            stroke="var(--series-dqn)" strokeWidth={2} />
        ))}
        <text x={Math.min(x(xs[best]) + 10, W - PAD.right - 150)} y={y(ys[best]) - 10} fontSize={12} fontWeight={600} fill="var(--series-dqn)">
          kept checkpoint · {ys[best].toFixed(1)}
        </text>
      </svg>
      <p className="muted small" style={{ margin: "8px 0 0" }}>
        Mean episode reward on 10 fixed validation scenarios (60 s each), measured every {kSteps(xs[1] - xs[0] || xs[0])} steps.
        Reward = flashes caught + 2 × emitters found. The curve is noisy, so the best validation checkpoint is kept, not the last one.
      </p>
    </div>
  );
}

/** State features, then Q-network, then action. */
export function DqnPipeline() {
  return (
    <div className={s.chain}>
      <div className={s.chainStep}>
        <strong>State · 217 numbers</strong>
        For each of 36 frequency slices: time since last look, time since last detection, detections, emitters seen,
        last dwell, last outcome. Plus mission time.
      </div>
      <span className={s.chainArrow} aria-hidden>→</span>
      <div className={s.chainStep}>
        <strong>Q-network</strong>
        A 256 × 256 multilayer perceptron estimates the future reward of each action. Double-Q targets curb over-estimation; 5-step returns speed up learning from delayed reward.
      </div>
      <span className={s.chainArrow} aria-hidden>→</span>
      <div className={s.chainStep}>
        <strong>Action · 1 of 36</strong>
        Tune the slice with the highest Q-value and listen for a fixed 25 ms.
      </div>
    </div>
  );
}

const ROWS: [string, string, string][] = [
  ["Knows radar physics", "Yes: periodic and on/off models per emitter", "No: learns from reward alone"],
  ["Learns during the mission", "Yes, from every hit and miss", "No, the policy is frozen after training"],
  ["Training before use", "None; priors fit from the dataset", "Hundreds of thousands of simulated looks"],
  ["Dwell choice", "5 to 100 ms, chosen per look", "Fixed 25 ms"],
  ["Explains each decision", "Yes: score terms and mode", "Only Q-values"],
];

export function RlComparison() {
  return (
    <table className={s.compare}>
      <thead><tr><th /><th>Smart Scan</th><th>Double-DQN</th></tr></thead>
      <tbody>
        {ROWS.map(([k, a, b]) => <tr key={k}><td>{k}</td><td>{a}</td><td>{b}</td></tr>)}
      </tbody>
    </table>
  );
}
