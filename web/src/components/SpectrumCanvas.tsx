"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { policyLabel, type PolicyRun, type Scenario } from "@/lib/api";

const PAD = { left: 44, right: 12, top: 8, bottom: 24 };
const FMAX = 18_000;

type Hover = { x: number; y: number; lines: string[] } | null;

function cssVar(el: HTMLElement, name: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || "#888";
}

function lastIndexAtOrBefore(arr: number[], t: number) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export type SpectrumCanvasProps = {
  scenario: Scenario; run: PolicyRun; cursor: number; colorVar: string;
  /** Fixed plot height in CSS px; ignored when `fill` is set. */
  height?: number;
  /** Size to the parent box in both dimensions (parent must have a definite height). */
  fill?: boolean;
  /** Show the "Frequency (GHz) vs time" caption under the plot. Defaults to true unless `fill`. */
  caption?: boolean;
};

export default function SpectrumCanvas({ scenario, run, cursor, colorVar, height = 260, fill = false, caption }: SpectrumCanvasProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 800, h: height });
  const [hover, setHover] = useState<Hover>(null);
  const showCaption = caption ?? !fill;

  const flashFreq = useMemo(() => new Map(scenario.flashes.rows.map((r) => [`${r[0]}:${r[1]}`, r[4]])), [scenario]);
  const labels = useMemo(() => new Map(scenario.emitters.map((e) => [e.id, e])), [scenario]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setBox((b) => {
        const next = fill
          ? { w: Math.max(120, Math.floor(w)), h: Math.max(60, Math.floor(h)) }
          : { w: Math.max(320, Math.floor(w)), h: b.h };
        return next.w === b.w && next.h === b.h ? b : next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);

  const width = box.w;
  const plotHeight = fill ? box.h : height;
  const H = scenario.horizon_s;
  const plotW = width - PAD.left - PAD.right;
  const plotH = plotHeight - PAD.top - PAD.bottom;
  const xOf = (t: number) => PAD.left + (t / H) * plotW;
  const yOf = (f: number) => PAD.top + (1 - f / FMAX) * plotH;

  useEffect(() => {
    const cv = canvas.current, el = wrap.current;
    if (!cv || !el) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(width * dpr), ph = Math.round(plotHeight * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = {
      surface: cssVar(el, "--surface-1"), grid: cssVar(el, "--grid"), muted: cssVar(el, "--text-muted"),
      truth: cssVar(el, "--truth"), series: cssVar(el, colorVar), ink: cssVar(el, "--text-primary"),
    };
    ctx.fillStyle = c.surface; ctx.fillRect(0, 0, width, plotHeight);

    // recessive grid: every 3 GHz (every 6 GHz when short), every 10 s
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.fillStyle = c.muted;
    const mono = cssVar(el, "--font-mono") || "ui-monospace, Cascadia Mono, Consolas, monospace";
    ctx.font = `11px ${mono}`;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const fStep = plotH < 120 ? 6000 : 3000;
    for (let f = 0; f <= FMAX; f += fStep) {
      const y = Math.round(yOf(f)) + 0.5;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(width - PAD.right, y); ctx.stroke();
      ctx.fillText(`${f / 1000}`, PAD.left - 8, y);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const step = H > 40 ? 10 : 5;
    for (let t = 0; t <= H + 1e-9; t += step) ctx.fillText(`${t}s`, xOf(t), plotHeight - PAD.bottom + 6);

    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.left, PAD.top, plotW, plotH); ctx.clip();

    // receiver dwells: the band each look covered (±250 MHz drawn, so neighbours stay distinct).
    // Short search dwells are drawn faint so that thousands of them read as a wash, not a wall.
    const n = lastIndexAtOrBefore(run.looks.t, cursor);
    const bandH = Math.max(1, yOf(-250) - yOf(250));
    ctx.fillStyle = c.series;
    for (let i = 0; i <= n; i++) {
      const t = run.looks.t[i], f = scenario.centres_mhz[run.looks.centre[i]], d = run.looks.dwell_ms[i];
      ctx.globalAlpha = d >= 50 ? 0.3 : d >= 25 ? 0.2 : 0.09;
      ctx.fillRect(xOf(t), yOf(f + 250), Math.max(1, (d / 1000 / H) * plotW), bandH);
    }
    ctx.globalAlpha = 1;

    // truth on top: interceptable flashes that have happened so far
    ctx.fillStyle = c.truth;
    for (const [, , start, end, freq] of scenario.flashes.rows) {
      if (start > cursor) break;
      ctx.fillRect(xOf(start), yOf(freq) - 1.5, Math.max(1.5, xOf(end) - xOf(start)), 3);
    }

    // intercepts: dots with a surface ring, at the time the flash was caught
    const r = plotH < 140 ? 3 : 4;
    for (const [tHit, e, k] of run.intercepts) {
      if (tHit > cursor) break;
      const f = flashFreq.get(`${e}:${k}`) ?? labels.get(e)?.freqs_mhz[0] ?? 0;
      ctx.beginPath(); ctx.arc(xOf(tHit), yOf(f), r, 0, Math.PI * 2);
      ctx.fillStyle = c.series; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = c.surface; ctx.stroke();
    }
    ctx.restore();

    // playback cursor
    ctx.strokeStyle = c.ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    const cx = Math.round(xOf(Math.min(cursor, H))) + 0.5;
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
    ctx.globalAlpha = 1;
  }, [scenario, run, cursor, width, plotHeight, colorVar, flashFreq, labels, H, plotW, plotH]); // eslint-disable-line react-hooks/exhaustive-deps

  function onMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    if (x < PAD.left || x > width - PAD.right || y < PAD.top || y > PAD.top + plotH) return setHover(null);
    const t = ((x - PAD.left) / plotW) * H;
    const i = lastIndexAtOrBefore(run.looks.t, t);
    if (i < 0 || t > cursor) return setHover(null);
    const f = scenario.centres_mhz[run.looks.centre[i]];
    const found = run.looks.emitters[i];
    setHover({
      x, y,
      lines: [
        `t = ${run.looks.t[i].toFixed(3)} s`,
        `Dwell ${run.looks.dwell_ms[i]} ms at ${(f / 1000).toFixed(2)} GHz (±0.5)`,
        found.length ? `Detected: ${found.map((e) => labels.get(e)?.label || `emitter ${e}`).slice(0, 3).join(", ")}` : "No detection",
      ],
    });
  }

  const tooltip = hover && (
    <div className="tooltip" style={{
      left: Math.max(0, Math.min(hover.x + 12, width - 260)),
      top: fill && hover.y > plotHeight / 2 ? hover.y - 80 : hover.y + 12,
    }}>
      <div className="t-head">{hover.lines[0]}</div>
      {hover.lines.slice(1).map((l) => <div key={l}>{l}</div>)}
    </div>
  );
  const cv = (
    <canvas ref={canvas}
      style={{ width, height: plotHeight, display: "block", borderRadius: 8, ...(fill ? { position: "absolute", inset: 0 } : null) }}
      onMouseMove={onMove} onMouseLeave={() => setHover(null)}
      role="img" aria-label={`Spectrum-time view of ${policyLabel(run.policy)} dwells and intercepts`} />
  );

  if (fill) {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div ref={wrap} style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {cv}
        </div>
        {tooltip}
        {showCaption && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Frequency (GHz) vs time</div>}
      </div>
    );
  }

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      {cv}
      {tooltip}
      {showCaption && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Frequency (GHz) vs time</div>}
    </div>
  );
}
