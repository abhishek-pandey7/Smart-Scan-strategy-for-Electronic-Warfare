"use client";

import { useState } from "react";
import { type Benchmark, policyColor, policyDash, policyLabel } from "@/lib/api";
import { type MetricDef, metricStat, sortPolicies } from "./metrics";

type Props = {
  bench: Benchmark;
  group: string;
  metric: MetricDef;
  /** Policies to plot, in display order. Defaults to every policy present in the group. */
  policies?: string[];
};

export default function IntervalPlot({ bench, group, metric, policies }: Props) {
  const present = bench.summary.filter((e) => e.group === group && metricStat(e, metric.id));
  const order = policies ?? sortPolicies([...new Set(present.map((e) => e.policy))]);
  const rows = order
    .map((p) => present.find((e) => e.policy === p))
    .filter((e): e is NonNullable<typeof e> => !!e);

  const [hover, setHover] = useState<string | null>(null);
  const max = metric.max ?? Math.max(...rows.map((r) => metricStat(r, metric.id)!.ci95[1]), 1) * 1.05;
  const W = 560, rowH = 32, left = 168, right = 72, top = 8;
  const H = top + Math.max(rows.length, 1) * rowH + 22;
  const x = (v: number) => left + (v / max) * (W - left - right);

  if (!rows.length) {
    return <p className="muted small">No data for this metric in this scenario.</p>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${metric.label}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={x(f * max)} x2={x(f * max)} y1={top} y2={H - 20} stroke="var(--grid)" strokeWidth={1} />
          <text x={x(f * max)} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--text-muted)"
            fontFamily="var(--font-num)">{metric.fmt(f * max)}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const s = metricStat(r, metric.id)!;
        const y = top + i * rowH + rowH / 2;
        const isSmart = r.policy === "primes";
        const active = hover === r.policy;
        const color = policyColor(r.policy);
        const dash = policyDash(r.policy);
        return (
          <g key={r.policy} onMouseEnter={() => setHover(r.policy)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
            <rect
              x={0} y={y - rowH / 2} width={W} height={rowH}
              fill={isSmart ? "var(--accent-soft)" : active ? "var(--surface-2)" : "transparent"}
              rx={6}
            />
            <text
              x={left - 12} y={y} textAnchor="end" dominantBaseline="middle"
              fontSize={isSmart ? 13 : 12}
              fontWeight={isSmart ? 650 : 500}
              fill={isSmart ? "var(--accent-strong)" : "var(--text-secondary)"}
            >
              {policyLabel(r.policy)}
            </text>
            <line
              x1={x(s.ci95[0])} x2={x(s.ci95[1])} y1={y} y2={y}
              stroke={color} strokeWidth={isSmart ? 3.5 : 2.25} strokeLinecap="round"
              strokeDasharray={dash}
              opacity={isSmart || active ? 1 : 0.85}
            />
            <circle
              cx={x(s.mean)} cy={y} r={isSmart ? 6.5 : 5}
              fill={color} stroke="var(--surface-1)" strokeWidth={isSmart ? 2.5 : 2}
            />
            <text
              x={W - right + 10} y={y} dominantBaseline="middle" fontSize={13}
              fontWeight={isSmart ? 650 : 500}
              fill={isSmart ? "var(--accent-strong)" : "var(--text-primary)"}
              fontFamily="var(--font-num)"
            >
              {metric.fmt(s.mean)}
            </text>
            {active && (
              <text x={x(s.mean)} y={y - 11} textAnchor="middle" fontSize={11} fill="var(--text-secondary)"
                fontFamily="var(--font-num)">
                95% CI {metric.fmt(s.ci95[0])} – {metric.fmt(s.ci95[1])} · n = {s.n}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
