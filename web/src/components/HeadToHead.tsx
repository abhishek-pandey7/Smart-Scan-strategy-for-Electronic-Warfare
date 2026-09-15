"use client";

import { useMemo } from "react";
import { type RunPayload, policyColor, policyLabel } from "@/lib/api";

/** Live head-to-head: every number is recomputed at the playback cursor. */
export default function HeadToHead({ data, a, b, cursor }: { data: RunPayload; a: string; b: string; cursor: number }) {
  const starts = useMemo(() => data.scenario.flashes.rows.map((r) => r[2]).sort((x, y) => x - y), [data]);
  const emitters = Number(data.runs[a]?.metrics.emitters ?? data.scenario.emitters.length);

  const at = (p: string) => {
    const tl = data.runs[p].timeline;
    const i = Math.max(0, Math.min(tl.t.length - 1, Math.floor(cursor / (tl.t[1] - tl.t[0] || 0.25))));
    return { caught: tl.intercepted[i], found: tl.discovered[i] };
  };
  let happened = 0;
  while (happened < starts.length && starts[happened] <= cursor) happened++;

  const A = at(a), B = at(b);
  const leader = B.caught >= A.caught ? b : a;
  const trailer = leader === b ? a : b;
  const L = leader === b ? B : A, T = leader === b ? A : B;

  let headline: string, factor: string;
  if (L.caught === 0) {
    factor = "–";
    headline = "Nothing caught yet. Press play and watch the counters.";
  } else if (T.caught === 0) {
    factor = `${L.caught} vs 0`;
    headline = `radar flashes caught: ${policyLabel(leader)} vs ${policyLabel(trailer)}, which has caught none so far`;
  } else if (L.caught === T.caught) {
    factor = "1.0×";
    headline = "Both schedulers have caught the same number of flashes so far";
  } else {
    factor = `${(L.caught / T.caught).toFixed(1)}×`;
    headline = `more radar flashes caught by ${policyLabel(leader)} than by ${policyLabel(trailer)}`;
  }

  const rows = [
    { label: "Radar flashes caught", max: Math.max(happened, 1), va: A.caught, vb: B.caught,
      fmt: (v: number) => `${v}`, note: `of ${happened} that have occurred` },
    { label: "Radars found", max: Math.max(emitters, 1), va: A.found, vb: B.found,
      fmt: (v: number) => `${v}`, note: `of ${emitters} present` },
    { label: "Share of flashes caught", max: 1, va: happened ? A.caught / happened : 0, vb: happened ? B.caught / happened : 0,
      fmt: (v: number) => `${Math.round(v * 100)}%`, note: "so far" },
  ];

  return (
    <div className="card h2h" aria-live="polite">
      <div className="h2h-hero">
        <div className="h2h-factor" style={{ color: L.caught ? "var(--text-primary)" : "var(--text-muted)" }}>{factor}</div>
        <div>
          <div className="h2h-headline">{headline}</div>
          <div className="muted">Live at t = {cursor.toFixed(1)} s. Both receivers face exactly the same radars.</div>
        </div>
      </div>
      <div className="h2h-rows">
        {rows.map((r) => (
          <div key={r.label} className="h2h-row">
            <div className="h2h-label">{r.label} <span className="muted">({r.note})</span></div>
            {[[a, r.va], [b, r.vb]].map(([p, v]) => (
              <div key={p as string} className="h2h-bar">
                <span className="key h2h-name"><span className="swatch" style={{ background: policyColor(p as string) }} />{policyLabel(p as string)}</span>
                <span className="h2h-track">
                  <span className="h2h-fill" style={{ width: `${Math.min(100, (100 * (v as number)) / r.max)}%`, background: policyColor(p as string) }} />
                </span>
                <span className="h2h-value">{r.fmt(v as number)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
