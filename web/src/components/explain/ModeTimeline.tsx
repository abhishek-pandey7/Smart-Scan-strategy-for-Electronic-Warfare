"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Explanation } from "@/lib/api";
import { MODES, MODE_LABEL, MODE_RULE, MODE_VERB, modeColor, type Mode } from "./modes";
import s from "./explain.module.css";

type Segment = { mode: Mode; t0: number; t1: number };

/** Consecutive decisions in the same mode merged into one span; a decision lasts until the next one. */
function segmentsOf(ex: Explanation[], horizon: number): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < ex.length; i++) {
    const t1 = i + 1 < ex.length ? ex[i + 1].t : horizon;
    const last = out[out.length - 1];
    if (last && last.mode === ex[i].mode) last.t1 = t1;
    else out.push({ mode: ex[i].mode, t0: ex[i].t, t1 });
  }
  return out;
}

const PAD = { left: 64, right: 14 };
const BAND_Y = 6, BAND_H = 26, LANE_H = 20, TRACK_Y = BAND_Y + 3 * LANE_H + 16, TRACK_H = 44, H = TRACK_Y + TRACK_H + 26;

export type ModeTimelineProps = {
  explanations: Explanation[];
  horizon: number;
  cursor: number;
  onSeek?: (t: number) => void;
};

export default function ModeTimeline({ explanations, horizon, cursor, onSeek }: ModeTimelineProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const segs = useMemo(() => segmentsOf(explanations, horizon), [explanations, horizon]);
  const stats = useMemo(() => {
    const time: Record<Mode, number> = { search: 0, track: 0, extend: 0 };
    const count: Record<Mode, number> = { search: 0, track: 0, extend: 0 };
    for (const g of segs) time[g.mode] += g.t1 - g.t0;
    for (const e of explanations) count[e.mode]++;
    return { time, count, switches: Math.max(0, segs.length - 1) };
  }, [segs, explanations]);
  const maxTracks = useMemo(() => Math.max(1, ...explanations.map((e) => e.tracks)), [explanations]);

  const plotW = width - PAD.left - PAD.right;
  const x = (t: number) => PAD.left + (Math.min(Math.max(t, 0), horizon) / horizon) * plotW;
  const laneY = (m: Mode) => BAND_Y + BAND_H + 8 + MODES.indexOf(m) * LANE_H;

  const yTracks = (n: number) => TRACK_Y + TRACK_H - (n / maxTracks) * TRACK_H;
  let trackPath = "", prevTracks = -1;
  for (const e of explanations) {
    if (e.tracks === prevTracks) continue;
    trackPath += trackPath ? `H${x(e.t).toFixed(1)}V${yTracks(e.tracks).toFixed(1)}` : `M${x(e.t).toFixed(1)},${yTracks(e.tracks).toFixed(1)}`;
    prevTracks = e.tracks;
  }
  if (trackPath) trackPath += `H${x(horizon).toFixed(1)}`;

  const seek = (ev: PointerEvent<SVGSVGElement>) => {
    if (!onSeek) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const t = ((ev.clientX - r.left - PAD.left) / plotW) * horizon;
    onSeek(Math.max(0, Math.min(horizon, t)));
  };

  const step = horizon > 40 ? 10 : 5;
  const cx = x(cursor);
  const segW = (g: Segment) => Math.max(1.5, x(g.t1) - x(g.t0));

  return (
    <div ref={wrap}>
      <svg width={width} height={H} className={s.band} role="img"
        aria-label={`Mode over time: ${MODES.map((m) => `${MODE_LABEL[m]} ${stats.time[m].toFixed(1)} s`).join(", ")}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seek(e); }}
        onPointerMove={(e) => { if (e.buttons) seek(e); }}>
        <text x={0} y={BAND_Y + 18} fontSize={13} fontWeight={600} fill="var(--text-secondary)">Mode</text>
        <rect x={PAD.left} y={BAND_Y} width={plotW} height={BAND_H} rx={4} fill="var(--surface-2)" />
        {segs.map((g, i) => (
          <rect key={i} x={x(g.t0)} y={BAND_Y} width={segW(g)} height={BAND_H} fill={modeColor(g.mode)}
            opacity={g.t0 <= cursor ? 1 : 0.28} />
        ))}

        {MODES.map((m) => (
          <g key={m}>
            <text x={0} y={laneY(m) + 13} fontSize={12} fill="var(--text-muted)">{MODE_LABEL[m]}</text>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={laneY(m) + LANE_H / 2} y2={laneY(m) + LANE_H / 2} stroke="var(--grid)" />
            {segs.filter((g) => g.mode === m).map((g, i) => (
              <rect key={i} x={x(g.t0)} y={laneY(m) + 4} width={segW(g)} height={LANE_H - 8} rx={1.5}
                fill={modeColor(m)} opacity={g.t0 <= cursor ? 0.95 : 0.25} />
            ))}
          </g>
        ))}

        <text x={0} y={TRACK_Y + 14} fontSize={12} fill="var(--text-muted)">Tracks</text>
        <text x={0} y={TRACK_Y + 30} fontSize={12} fill="var(--text-muted)" fontFamily="var(--font-num)">0–{maxTracks}</text>
        <rect x={PAD.left} y={TRACK_Y} width={plotW} height={TRACK_H} fill="var(--surface-2)" rx={4} opacity={0.6} />
        <path d={trackPath} fill="none" stroke="var(--text-secondary)" strokeWidth={1.75} />

        {Array.from({ length: Math.floor(horizon / step) + 1 }, (_, i) => i * step).map((tk) => (
          <text key={tk} x={x(tk)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--text-muted)" fontFamily="var(--font-num)">{tk}s</text>
        ))}

        <line x1={cx} x2={cx} y1={0} y2={TRACK_Y + TRACK_H + 4} stroke="var(--text-primary)" strokeWidth={2} />
        <circle cx={cx} cy={BAND_Y + BAND_H / 2} r={5} fill="var(--surface-1)" stroke="var(--text-primary)" strokeWidth={2} />
      </svg>

      <div className={s.shares}>
        {MODES.map((m) => (
          <span key={m} className="key">
            <span className="swatch" style={{ background: modeColor(m) }} />
            {MODE_VERB[m]} <strong>{((100 * stats.time[m]) / horizon).toFixed(1)}%</strong> of time
            <span className="muted">· {stats.count[m]} decisions</span>
          </span>
        ))}
        <span><strong>{stats.switches}</strong> mode switches <span className="muted">(whole run)</span></span>
      </div>
    </div>
  );
}

/** The three rules, with the one in force at the cursor highlighted. */
export function ModeRules({ active }: { active?: Mode | null }) {
  return (
    <div className={s.rules}>
      {MODES.map((m) => (
        <div key={m} className={[s.rule, active === m && s.ruleActive].filter(Boolean).join(" ")}
          style={active === m ? { borderColor: modeColor(m) } : undefined}>
          <span className={s.dot} style={{ background: modeColor(m) }} />
          <strong>{MODE_LABEL[m]}</strong>
          <p>{MODE_RULE[m]}</p>
        </div>
      ))}
    </div>
  );
}
