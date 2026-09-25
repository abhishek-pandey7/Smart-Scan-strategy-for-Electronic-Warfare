"use client";

import { useEffect, useRef, useState } from "react";

export type Series = {
  key: string; label: string; color: string; x: number[]; y: number[];
  /** SVG stroke-dasharray; use policyDash(id) for the Oracle reference. */
  dash?: string;
};

const PAD = { left: 40, right: 16, top: 10, bottom: 24 };

/** Round tick step (1, 2 or 5 × 10^k, never below 1 for counts) and the axis max it implies. */
function niceScale(v: number, target = 4) {
  const raw = Math.max(v, 1) / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].find((m) => m * p >= raw)! * p);
  return { step, max: Math.ceil(Math.max(v, 1) / step) * step };
}

function valueAt(s: Series, t: number) {
  let lo = 0, hi = s.x.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.x[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return s.y[ans] ?? 0;
}

export type LineChartProps = {
  series: Series[]; horizon: number; cursor: number;
  /** Fixed plot height in CSS px; ignored when `fill` is set. */
  height?: number;
  format?: (v: number) => string;
  /** Size to the parent box in both dimensions (parent must have a definite height). */
  fill?: boolean;
  /** Render the built-in legend (only shown for 2+ series). Defaults to true. */
  legend?: boolean;
};

export default function LineChart({ series, horizon, cursor, height = 200, format = (v: number) => `${v}`, fill = false, legend = true }: LineChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 600, h: height });
  const [hoverT, setHoverT] = useState<number | null>(null);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      setBox((b) => {
        const next = fill
          ? { w: Math.max(160, Math.floor(w)), h: Math.max(80, Math.floor(h)) }
          : { w: Math.max(280, Math.floor(w)), h: b.h };
        return next.w === b.w && next.h === b.h ? b : next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);

  const width = box.w;
  const chartH = fill ? box.h : height;
  const plotW = width - PAD.left - PAD.right, plotH = chartH - PAD.top - PAD.bottom;
  const scale = niceScale(Math.max(1, ...series.map((s) => Math.max(...s.y))), chartH < 160 ? 3 : 4);
  const yMax = scale.max;
  const xOf = (t: number) => PAD.left + (t / horizon) * plotW;
  const yOf = (v: number) => PAD.top + (1 - v / yMax) * plotH;
  const ticks = Array.from({ length: Math.round(yMax / scale.step) + 1 }, (_, i) => i * scale.step);
  const step = horizon > 40 ? 10 : 5;

  const path = (s: Series) => {
    let d = "";
    for (let i = 0; i < s.x.length && s.x[i] <= cursor; i++) {
      d += `${i ? "L" : "M"}${xOf(s.x[i]).toFixed(1)},${yOf(s.y[i]).toFixed(1)}`;
    }
    return d;
  };

  const t = hoverT ?? null;
  return (
    <div style={fill
      ? { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0 }
      : { position: "relative" }}>
      {legend && series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key} className="key">
              {s.dash ? (
                <svg width={22} height={10} aria-hidden>
                  <line x1={1} x2={21} y1={5} y2={5} stroke={s.color} strokeWidth={3} strokeLinecap="round" strokeDasharray={s.dash} />
                </svg>
              ) : (
                <span className="swatch" style={{ background: s.color }} />
              )}
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div ref={plotRef} style={fill ? { position: "relative", flex: 1, minHeight: 0, overflow: "hidden" } : { position: "relative" }}>
        <svg width={width} height={chartH} role="img" aria-label={series.map((s) => s.label).join(" vs ")}
          style={fill ? { position: "absolute", inset: 0, display: "block" } : { display: "block" }}
          onMouseMove={(ev) => {
            const x = ev.clientX - ev.currentTarget.getBoundingClientRect().left;
            const tt = ((x - PAD.left) / plotW) * horizon;
            setHoverT(tt >= 0 && tt <= Math.min(cursor, horizon) ? tt : null);
          }}
          onMouseLeave={() => setHoverT(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={yOf(v)} y2={yOf(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.left - 6} y={yOf(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--text-muted)"
                fontFamily="var(--font-num)" style={{ fontVariantNumeric: "tabular-nums" }}>{format(v)}</text>
            </g>
          ))}
          {Array.from({ length: Math.floor(horizon / step) + 1 }, (_, i) => i * step).map((tk) => (
            <text key={tk} x={xOf(tk)} y={chartH - 6} textAnchor="middle" fontSize={11} fill="var(--text-muted)"
              fontFamily="var(--font-num)">{tk}s</text>
          ))}
          {series.map((s) => (
            <path key={s.key} d={path(s)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={s.dash} />
          ))}
          {series.map((s) => {
            const tEnd = Math.min(cursor, horizon);
            return <circle key={s.key} cx={xOf(tEnd)} cy={yOf(valueAt(s, tEnd))} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />;
          })}
          {t !== null && (
            <line x1={xOf(t)} x2={xOf(t)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--axis)" strokeWidth={1} />
          )}
        </svg>
      </div>
      {t !== null && (
        <div className="tooltip" style={{ left: Math.max(0, Math.min(xOf(t) + 12, width - 200)), top: PAD.top }}>
          <div className="t-head">t = {t.toFixed(1)} s</div>
          {series.map((s) => (
            <div key={s.key} className="key" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span className="key"><span className="swatch" style={{ background: s.color }} />{s.label}</span>
              <strong style={{ color: "var(--text-primary)" }}>{format(valueAt(s, t))}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
