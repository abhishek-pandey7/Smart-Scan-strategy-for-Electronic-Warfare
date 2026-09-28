"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { indexAtOrBefore, type Explanation, type PolicyRun, type Scenario } from "@/lib/api";
import type { FlashIndex, NextFlash } from "./derive";
import s from "./eklavya.module.css";

const PAD = { left: 40, right: 10, top: 10, bottom: 22 };
const FMAX = 18_000;
const HALF_BAND = 250;

function cssVar(el: HTMLElement, name: string, fallback = "#888") {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

function tickStep(w: number) {
  return w <= 1.2 ? 0.1 : w <= 3.5 ? 0.5 : w <= 12 ? 1 : 5;
}

export type ScanSpectrumProps = {
  scenario: Scenario; run: PolicyRun; fx: FlashIndex; cursor: number; windowS: number;
  decision?: Explanation; nexts: NextFlash[]; height: number; onSeek: (t: number) => void;
};

export default function ScanSpectrum({ scenario, run, fx, cursor, windowS, decision, nexts, height, onSeek }: ScanSpectrumProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = scenario.horizon_s;
  const W = Math.min(windowS, H);
  const t0 = Math.min(Math.max(0, cursor - 0.75 * W), Math.max(0, H - W));
  const t1 = t0 + W;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  useEffect(() => {
    const cv = canvas.current, el = wrap.current;
    if (!cv || !el) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const xOf = (t: number) => PAD.left + ((t - t0) / W) * plotW;
    const yOf = (f: number) => PAD.top + (1 - f / FMAX) * plotH;
    const c = {
      bg: cssVar(el, "--surface-1", "#fff"), grid: cssVar(el, "--grid"), muted: cssVar(el, "--text-muted"),
      ink: cssVar(el, "--text-primary", "#111"), truth: cssVar(el, "--truth"), look: cssVar(el, "--series-primes"),
      track: cssVar(el, "--mode-track"), search: cssVar(el, "--mode-search"), extend: cssVar(el, "--mode-extend"),
      font: cssVar(el, "--font-num", "ui-monospace, Consolas, monospace"),
    };
    const modeCol = { search: c.search, track: c.track, extend: c.extend };

    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, width, height);
    ctx.font = `11px ${c.font}`;
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.fillStyle = c.muted;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let f = 0; f <= FMAX; f += 3000) {
      const y = Math.round(yOf(f)) + 0.5;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(width - PAD.right, y); ctx.stroke();
      ctx.fillText(`${f / 1000}`, PAD.left - 6, y);
    }
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("GHz", 4, 0);
    const step = tickStep(W);
    ctx.textAlign = "center";
    for (let t = Math.ceil(t0 / step - 1e-9) * step; t <= t1 + 1e-9; t += step) {
      const x = Math.round(xOf(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + plotH); ctx.stroke();
      ctx.fillText(`${+t.toFixed(1)}s`, x, height - PAD.bottom + 6);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.left, PAD.top, plotW, plotH); ctx.clip();

    // looks up to the cursor: the ±250 MHz band each dwell covered
    const lt = run.looks.t;
    const first = Math.max(0, indexAtOrBefore(lt, t0 - 0.11));
    const last = indexAtOrBefore(lt, cursor);
    ctx.fillStyle = c.look;
    for (let i = first; i <= last; i++) {
      const t = lt[i], f = scenario.centres_mhz[run.looks.centre[i]], d = run.looks.dwell_ms[i] / 1000;
      if (t + d < t0) continue;
      ctx.globalAlpha = run.looks.emitters[i].length ? 0.6 : d >= 0.05 ? 0.28 : d >= 0.025 ? 0.2 : 0.12;
      ctx.fillRect(xOf(t), yOf(f + HALF_BAND), Math.max(1, (d / W) * plotW), yOf(f - HALF_BAND) - yOf(f + HALF_BAND));
    }
    ctx.globalAlpha = 1;

    // radar flashes (truth): solid once they have happened, outlined ahead of the cursor
    const rows = scenario.flashes.rows;
    let lo = 0, hi = rows.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m][2] < t0 - 0.2) lo = m + 1; else hi = m; }
    ctx.lineWidth = 1;
    for (let i = lo; i < rows.length && rows[i][2] <= t1; i++) {
      const [, , start, end, freq] = rows[i];
      const x = xOf(start), w = Math.max(2, xOf(end) - x), y = yOf(freq) - 3;
      if (start <= cursor) { ctx.fillStyle = c.truth; ctx.fillRect(x, y, w, 6); }
      else { ctx.strokeStyle = c.truth; ctx.globalAlpha = 0.6; ctx.strokeRect(x + 0.5, y + 0.5, w, 5); ctx.globalAlpha = 1; }
    }

    // prediction: t_next = t_last + k·T drawn as a dashed span from the last catch to the predicted flash
    for (const nf of nexts) {
      if (nf.freq === null || nf.tNext < t0 || (nf.tLast !== null ? nf.tLast : nf.tNext) > t1) continue;
      const y = yOf(nf.freq), xN = xOf(nf.tNext);
      const hot = decision?.track?.emitter === nf.emitter;
      ctx.strokeStyle = c.track; ctx.fillStyle = c.track;
      if (nf.tLast !== null) {
        ctx.setLineDash([4, 4]); ctx.globalAlpha = hot ? 0.9 : 0.5; ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.moveTo(xOf(nf.tLast), y); ctx.lineTo(xN, y); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1; ctx.lineWidth = hot ? 2.5 : 1.5;
      ctx.beginPath(); ctx.arc(xN, y, hot ? 8 : 6, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText(`t̂ #${nf.emitter}`, xN + 9, y - 4);
    }

    const tr = decision?.track;
    if (decision && tr && tr.next_flash_in_ms !== null && !nexts.some((n) => n.emitter === tr.emitter)) {
      const tN = decision.t + tr.next_flash_in_ms / 1000;
      if (tN >= t0 && tN <= t1) {
        const xN = xOf(tN), y = yOf(decision.centre_mhz);
        ctx.strokeStyle = c.track; ctx.fillStyle = c.track; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(xN, y, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.textAlign = "left"; ctx.textBaseline = "bottom";
        ctx.fillText(`t̂ #${tr.emitter}`, xN + 9, y - 4);
      }
    }

    // intercepts
    for (const [tHit, e, k] of run.intercepts) {
      if (tHit > cursor) break;
      if (tHit < t0 - 0.05) continue;
      const f = fx.freq.get(`${e}:${k}`) ?? scenario.emitters.find((x) => x.id === e)?.freqs_mhz[0] ?? 0;
      ctx.beginPath(); ctx.arc(xOf(tHit), yOf(f), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = c.look; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.bg; ctx.stroke();
    }

    // the decision in force: its (c, d) outlined in its mode colour
    if (decision && decision.t + decision.dwell_ms / 1000 >= t0 && decision.t <= t1) {
      const x = xOf(decision.t), w = Math.max(3, (decision.dwell_ms / 1000 / W) * plotW);
      const yT = yOf(decision.centre_mhz + HALF_BAND), yB = yOf(decision.centre_mhz - HALF_BAND);
      ctx.strokeStyle = modeCol[decision.mode]; ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, yT - 1, w + 2, yB - yT + 2);
      ctx.fillStyle = modeCol[decision.mode];
      const below = yB + 18 < PAD.top + plotH;
      ctx.textAlign = x > PAD.left + plotW - 150 ? "right" : "left";
      ctx.textBaseline = below ? "top" : "bottom";
      ctx.font = `600 12px ${c.font}`;
      ctx.fillText(`c=${(decision.centre_mhz / 1000).toFixed(2)} GHz  d=${decision.dwell_ms} ms`,
        ctx.textAlign === "right" ? x + w : x, below ? yB + 4 : yT - 4);
    }
    ctx.restore();

    const cx = Math.round(xOf(cursor)) + 0.5;
    ctx.strokeStyle = c.ink; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
    ctx.globalAlpha = 1;
  }, [scenario, run, fx, cursor, decision, nexts, width, height, t0, W, plotW, plotH, t1]);

  const seek = (ev: PointerEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(H, t0 + ((ev.clientX - r.left - PAD.left) / plotW) * W)));
  };

  return (
    <div ref={wrap} className={s.spectrum}>
      <canvas ref={canvas} style={{ width, height }} className={s.canvas}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seek(e); }}
        onPointerMove={(e) => { if (e.buttons) seek(e); }}
        role="img" aria-label={`Eklavya looks and radar flashes from ${t0.toFixed(1)} to ${t1.toFixed(1)} s`} />
    </div>
  );
}
