"use client";

import { useState } from "react";

export type PointSeries = { key: string; label: string; color: string; y: (number | null)[]; bold?: boolean };

/** Small categorical line chart: shared x categories, values 0..1 shown as percentages. */
export default function PointChart({ categories, series, xLabel, height = 220 }: {
  categories: string[]; series: PointSeries[]; xLabel: string; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 520, H = height, pad = { left: 44, right: 34, top: 12, bottom: 44 };
  const plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (categories.length === 1 ? plotW / 2 : (i / (categories.length - 1)) * plotW);
  const y = (v: number) => pad.top + (1 - v) * plotH;
  return (
    <div style={{ position: "relative" }}>
      <div className="legend">
        {series.map((s) => (
          <span key={s.key} className="key"><span className="swatch" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${series.map((s) => s.label).join(", ")} by ${xLabel}`}
        onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={pad.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--text-muted)">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {categories.map((c, i) => (
          <g key={c}>
            <rect x={x(i) - plotW / Math.max(categories.length - 1, 1) / 2} y={pad.top} height={plotH}
              width={plotW / Math.max(categories.length - 1, 1)} fill={hover === i ? "var(--surface-2)" : "transparent"}
              onMouseEnter={() => setHover(i)} />
            <text x={x(i)} y={H - pad.bottom + 16} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">{c}</text>
          </g>
        ))}
        <text x={pad.left + plotW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{xLabel}</text>
        {series.map((s) => {
          const pts = s.y.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => p !== null);
          return (
            <g key={s.key} pointerEvents="none">
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth={s.bold ? 3 : 2}
                strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r={s.bold ? 4.5 : 3.5} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
              ))}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${Math.min(80, (x(hover) / W) * 100)}%`, top: 28 }}>
          <div className="t-head">{categories[hover]}</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span className="key"><span className="swatch" style={{ background: s.color }} />{s.label}</span>
              <strong>{s.y[hover] === null ? "–" : `${((s.y[hover] as number) * 100).toFixed(1)}%`}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
