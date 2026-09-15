"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PolicyRun, Scenario } from "@/lib/api";

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

export default function SpectrumCanvas({ scenario, run, cursor, colorVar, height = 260 }: {
  scenario: Scenario; run: PolicyRun; cursor: number; colorVar: string; height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<Hover>(null);

  const flashFreq = useMemo(() => new Map(scenario.flashes.rows.map((r) => [`${r[0]}:${r[1]}`, r[4]])), [scenario]);
  const labels = useMemo(() => new Map(scenario.emitters.map((e) => [e.id, e])), [scenario]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = scenario.horizon_s;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const xOf = (t: number) => PAD.left + (t / H) * plotW;
  const yOf = (f: number) => PAD.top + (1 - f / FMAX) * plotH;

  useEffect(() => {
    const cv = canvas.current, el = wrap.current;
    if (!cv || !el) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = {
      surface: cssVar(el, "--surface-1"), grid: cssVar(el, "--grid"), muted: cssVar(el, "--text-muted"),
      truth: cssVar(el, "--truth"), series: cssVar(el, colorVar), ink: cssVar(el, "--text-primary"),
    };
    ctx.fillStyle = c.surface; ctx.fillRect(0, 0, width, height);

    // recessive grid: every 3 GHz, every 10 s
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.fillStyle = c.muted; ctx.font = "11px system-ui";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let f = 0; f <= FMAX; f += 3000) {
      const y = Math.round(yOf(f)) + 0.5;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(width - PAD.right, y); ctx.stroke();
      ctx.fillText(`${f / 1000}`, PAD.left - 8, y);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const step = H > 40 ? 10 : 5;
    for (let t = 0; t <= H + 1e-9; t += step) ctx.fillText(`${t}s`, xOf(t), height - PAD.bottom + 6);

    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.left, PAD.top, plotW, plotH); ctx.clip();

    // truth: interceptable flashes that have happened so far
    ctx.fillStyle = c.truth;
    for (const [, , start, end, freq] of scenario.flashes.rows) {
      if (start > cursor) break;
      ctx.fillRect(xOf(start), yOf(freq) - 1.5, Math.max(1.5, xOf(end) - xOf(start)), 3);
    }

    // receiver dwells: the band each look covered (±250 MHz drawn, so neighbours stay distinct)
    const n = lastIndexAtOrBefore(run.looks.t, cursor);
    ctx.globalAlpha = 0.28; ctx.fillStyle = c.series;
    for (let i = 0; i <= n; i++) {
      const t = run.looks.t[i], f = scenario.centres_mhz[run.looks.centre[i]];
      ctx.fillRect(xOf(t), yOf(f + 250), Math.max(1, (run.looks.dwell_ms[i] / 1000 / H) * plotW), yOf(f - 250) - yOf(f + 250));
    }
    ctx.globalAlpha = 1;

    // intercepts: dots with a surface ring, at the time the flash was caught
    for (const [tHit, e, k] of run.intercepts) {
      if (tHit > cursor) break;
      const f = flashFreq.get(`${e}:${k}`) ?? labels.get(e)?.freqs_mhz[0] ?? 0;
      ctx.beginPath(); ctx.arc(xOf(tHit), yOf(f), 4, 0, Math.PI * 2);
      ctx.fillStyle = c.series; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.surface; ctx.stroke();
    }
    ctx.restore();

    // playback cursor
    ctx.strokeStyle = c.ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    const cx = Math.round(xOf(Math.min(cursor, H))) + 0.5;
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
    ctx.globalAlpha = 1;
  }, [scenario, run, cursor, width, height, colorVar, flashFreq, labels, H, plotW, plotH]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <canvas ref={canvas} style={{ width, height, display: "block", borderRadius: 8 }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        role="img" aria-label={`Spectrum-time view of ${run.policy} dwells and intercepts`} />
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 260), top: hover.y + 12 }}>
          <div className="t-head">{hover.lines[0]}</div>
          {hover.lines.slice(1).map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Frequency (GHz) vs time</div>
    </div>
  );
}
