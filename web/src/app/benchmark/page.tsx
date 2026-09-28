"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { type Benchmark, getBenchmark, policyColor, policyLabel } from "@/lib/api";

const METRICS = [
  { id: "interception_ratio", label: "Flashes intercepted", max: 1, fmt: (v: number) => `${(v * 100).toFixed(1)}%`, higher: true },
  { id: "discovery_fraction", label: "Emitters discovered", max: 1, fmt: (v: number) => `${(v * 100).toFixed(0)}%`, higher: true },
  { id: "ttfi_mean_s", label: "Mean time to first intercept", max: null, fmt: (v: number) => `${v.toFixed(1)} s`, higher: false },
  { id: "prediction_correct_pct", label: "Next-flash predictions correct", max: 100, fmt: (v: number) => `${v.toFixed(0)}%`, higher: true },
] as const;

const GROUP_LABEL: Record<string, string> = {
  easy: "Easy", lockout: "Lock-out", popup: "Pop-up", dense: "Dense (40 emitters)", mixed: "Mixed periodic + intermittent",
  turing: "Turing dataset (real scenarios)",
};
// The six the demo narrates. Ablations stay available behind a toggle so nothing is lost.
const MAIN_POLICIES = ["oracle", "primes", "dqn", "greedy", "raster", "random"];
const ABLATIONS = ["primes_no_micro", "primes_flat", "primes_no_ig", "primes_fprior"];
const POLICY_ORDER = ["oracle", "primes", ...ABLATIONS, "dqn", "greedy", "raster", "random"];

type MetricId = (typeof METRICS)[number]["id"];

function IntervalPlot({ bench, group, metric, policies }:
  { bench: Benchmark; group: string; metric: (typeof METRICS)[number]; policies: string[] }) {
  const rows = bench.summary
    .filter((e) => e.group === group && e[metric.id] && policies.includes(e.policy))
    .sort((a, b) => POLICY_ORDER.indexOf(a.policy) - POLICY_ORDER.indexOf(b.policy));
  const [hover, setHover] = useState<string | null>(null);
  const max = metric.max ?? Math.max(...rows.map((r) => r[metric.id]!.ci95[1]), 1) * 1.05;
  const W = 520, rowH = 30, left = 168, right = 74, top = 8;
  const H = top + rows.length * rowH + 20;
  const x = (v: number) => left + (v / max) * (W - left - right);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${metric.label}, ${GROUP_LABEL[group] ?? group}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={x(f * max)} x2={x(f * max)} y1={top} y2={H - 18} stroke="var(--grid)" />
          <text x={x(f * max)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{metric.fmt(f * max)}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const s = r[metric.id]!;
        const y = top + i * rowH + rowH / 2;
        const active = hover === r.policy;
        return (
          <g key={r.policy} onMouseEnter={() => setHover(r.policy)} onMouseLeave={() => setHover(null)}>
            <rect x={0} y={y - rowH / 2} width={W} height={rowH} fill={active ? "var(--surface-2)" : "transparent"} />
            <text x={left - 10} y={y} textAnchor="end" dominantBaseline="middle" fontSize={13}
              fill={r.policy === "primes" ? "var(--text-primary)" : "var(--text-secondary)"} fontWeight={r.policy === "primes" ? 600 : 400}>
              {policyLabel(r.policy)}
            </text>
            <line x1={x(s.ci95[0])} x2={x(s.ci95[1])} y1={y} y2={y} stroke={policyColor(r.policy)} strokeWidth={2} strokeLinecap="round" />
            <circle cx={x(s.mean)} cy={y} r={5} fill={policyColor(r.policy)} stroke="var(--surface-1)" strokeWidth={2} />
            <text x={W - right + 8} y={y} dominantBaseline="middle" fontSize={13} fill="var(--text-primary)"
              style={{ fontVariantNumeric: "tabular-nums" }}>
              {metric.fmt(s.mean)}
            </text>
            {active && (
              <text x={x(s.mean)} y={y - 9} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">
                95% CI {metric.fmt(s.ci95[0])} – {metric.fmt(s.ci95[1])} · n = {s.n}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function BenchmarkPage() {
  const [bench, setBench] = useState<Benchmark | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metricId, setMetricId] = useState<MetricId>("interception_ratio");
  const [showTable, setShowTable] = useState(false);
  const [showAblations, setShowAblations] = useState(false);

  useEffect(() => { getBenchmark().then(setBench).catch((e) => setError(String(e))); }, []);
  const metric = METRICS.find((m) => m.id === metricId)!;
  const shown = showAblations ? POLICY_ORDER : MAIN_POLICIES;
  const groups = useMemo(() => {
    const g = Array.from(new Set(bench?.summary.map((e) => e.group) ?? []));
    return g.sort((a, b) => Object.keys(GROUP_LABEL).indexOf(a) - Object.keys(GROUP_LABEL).indexOf(b));
  }, [bench]);

  return (
    <>
      <h1>Benchmark</h1>
      <p className="sub">
        Every scheduler replayed on identical truth. Dots are means, lines are 95% bootstrap confidence intervals.
        {" "}Why the numbers are not 100%, and where the missing flashes go: <Link href="/accuracy">Accuracy</Link>.
      </p>
      {error && <p className="notice">{error}</p>}
      {bench && (
        <>
          <div className="card controls">
            <div className="field">
              <label htmlFor="metric">Metric</label>
              <select id="metric" value={metricId} onChange={(e) => setMetricId(e.target.value as MetricId)}>
                {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <button className="btn ghost" onClick={() => setShowTable(!showTable)}>{showTable ? "Show charts" : "Show table"}</button>
            <button className="btn ghost" aria-pressed={showAblations} onClick={() => setShowAblations(!showAblations)}>
              {showAblations ? "Hide ablations" : "Show ablations"}
            </button>
            <span className="muted">
              {shown.length} schedulers · {bench.config.seeds} seeds per simulated family · {bench.config.turing.length} Turing scenarios
              {metric.higher ? " · higher is better" : " · lower is better"}
            </span>
          </div>

          {!showTable ? (
            <div className="grid-2">
              {groups.map((g) => (
                <div className="card" key={g}>
                  <h2>{GROUP_LABEL[g] ?? g}</h2>
                  <IntervalPlot bench={bench} group={g} metric={metric} policies={shown} />
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="data">
                <thead>
                  <tr><th>Scenario</th><th>Scheduler</th>{METRICS.map((m) => <th key={m.id}>{m.label}</th>)}<th>Runs</th></tr>
                </thead>
                <tbody>
                  {groups.flatMap((g) => bench.summary
                    .filter((e) => e.group === g && shown.includes(e.policy))
                    .sort((a, b) => POLICY_ORDER.indexOf(a.policy) - POLICY_ORDER.indexOf(b.policy))
                    .map((e) => (
                      <tr key={`${g}-${e.policy}`} className={e.policy === "primes" ? "highlight" : ""}>
                        <td>{GROUP_LABEL[g] ?? g}</td>
                        <td style={{ textAlign: "left" }}>{policyLabel(e.policy)}</td>
                        {METRICS.map((m) => {
                          const s = e[m.id];
                          return <td key={m.id}>{s ? `${m.fmt(s.mean)} [${m.fmt(s.ci95[0])}, ${m.fmt(s.ci95[1])}]` : "–"}</td>;
                        })}
                        <td>{e.n}</td>
                      </tr>
                    )))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
