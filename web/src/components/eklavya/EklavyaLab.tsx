"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { PlayBar } from "@/components/ui";
import { createRun, indexAtOrBefore, itemAtCursor, type PolicyRun, type RunPayload } from "@/lib/api";
import { usePlayback } from "@/lib/hooks";
import EquationPanel from "./EquationPanel";
import ScanSpectrum from "./ScanSpectrum";
import SecondStrip from "./SecondStrip";
import { indexFlashes, nextFlashes, perSecond } from "./derive";
import s from "./eklavya.module.css";

const SCENARIOS = [
  { id: "lockout", label: "Lock-out" },
  { id: "easy", label: "Easy" },
  { id: "mixed", label: "Mixed on/off" },
];
const SPEEDS = [0.1, 0.25, 1, 4] as const;
const WINDOWS = [1, 3, 10] as const;
const SPECTRUM_H = 480;

type Loaded = RunPayload | { error: string };

export default function EklavyaLab() {
  const [scenario, setScenario] = useState("lockout");
  const [cache, setCache] = useState<Record<string, Loaded>>({});
  const loaded = cache[scenario];

  useEffect(() => {
    if (loaded) return;
    let alive = true;
    createRun({ scenario, policies: ["primes"] })
      .then((d) => { if (alive) setCache((c) => ({ ...c, [scenario]: d })); })
      .catch((e: Error) => { if (alive) setCache((c) => ({ ...c, [scenario]: { error: e.message } })); });
    return () => { alive = false; };
  }, [scenario, loaded]);

  const retry = () => setCache((c) => { const next = { ...c }; delete next[scenario]; return next; });
  const payload = loaded && "runs" in loaded ? loaded : null;
  const run = payload?.runs.primes;

  return (
    <div className={s.page}>
      <header className={s.top}>
        <div>
          <div className="eyebrow">Ekalavya</div>
          <h1 className={s.title}>How it decides where to listen</h1>
          <p className={s.sub}>Every few milliseconds it scores each frequency and listen time, then picks the one that should catch the most radar flashes per second.</p>
        </div>
        <div className="segmented" role="group" aria-label="Scenario">
          {SCENARIOS.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === scenario} onClick={() => setScenario(x.id)}>{x.label}</button>
          ))}
        </div>
      </header>

      {payload && run ? <Lab key={scenario} payload={payload} run={run} />
        : loaded && "error" in loaded ? (
          <div className="notice error">Replay failed: {loaded.error} <button type="button" className="btn secondary" onClick={retry}>Retry</button></div>
        ) : payload ? <div className="notice">No Ekalavya lane in this run.</div>
        : <div className="notice">Replaying Ekalavya on {SCENARIOS.find((x) => x.id === scenario)?.label}… (first run up to a minute, then cached)</div>}
    </div>
  );
}

function Lab({ payload, run }: { payload: RunPayload; run: PolicyRun }) {
  const scenario = payload.scenario;
  const H = scenario.horizon_s;
  const ex = run.explanations;
  const pb = usePlayback(H, 0.25);
  const { setCursor, setPlaying } = pb;
  const [windowS, setWindowS] = useState<number>(3);

  const fx = useMemo(() => indexFlashes(scenario), [scenario]);
  const cells = useMemo(() => perSecond(ex, run.intercepts, H), [ex, run.intercepts, H]);
  const exT = useMemo(() => ex.map((e) => e.t), [ex]);
  const firstTrackEx = useMemo(() => ex.find((e) => e.mode === "track"), [ex]);
  const firstTrack = firstTrackEx?.t ?? 0;
  const hasTrack = firstTrackEx !== undefined;
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const fromUrl = Number.parseFloat(new URLSearchParams(window.location.search).get("t") ?? "");
    setCursor(Number.isFinite(fromUrl) ? fromUrl : firstTrack);
  }, [setCursor, firstTrack]);

  const cursor = pb.cursor;
  const decision = itemAtCursor(ex, cursor);
  const nexts = useMemo(() => nextFlashes(run, scenario, fx, cursor), [run, scenario, fx, cursor]);

  const seek = (t: number) => { setPlaying(false); setCursor(t); };
  const at = indexAtOrBefore(exT, cursor);
  const prevDecision = () => { if (at > 0) seek(exT[at - 1]); else seek(0); };
  const nextDecision = () => { if (at + 1 < exT.length) seek(exT[at + 1]); };
  const prevSecond = () => seek(Math.max(0, Math.floor(cursor + 1e-6) - 1));
  const nextSecond = () => seek(Math.min(H, Math.floor(cursor + 1e-6) + 1));
  const nextTrack = () => {
    const nx = ex.find((e) => e.mode === "track" && e.t > cursor + 1e-6) ?? ex.find((e) => e.mode === "track");
    if (nx) seek(nx.t);
  };
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowLeft") { e.preventDefault(); if (e.shiftKey) prevSecond(); else prevDecision(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); if (e.shiftKey) nextSecond(); else nextDecision(); }
    else if (e.key === " " && tag !== "BUTTON") { e.preventDefault(); setPlaying(!pb.playing); }
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <>
      <div className={s.main}>
        <section className={s.sim}>
          <div className={s.toolbar}>
            <div className={s.steps} role="group" aria-label="Step">
              <button type="button" className={s.step} onClick={prevDecision} title="←">‹ Previous decision</button>
              <button type="button" className={s.step} onClick={nextDecision} title="→">Next decision ›</button>
              <button type="button" className={s.step} data-accent onClick={nextTrack} disabled={!hasTrack}>Jump to next catch ›</button>
            </div>
            <span className={s.toolMeta}>{scenario.emitters.length} radars · {run.intercepts.length} flashes caught</span>
            <div className="segmented" role="group" aria-label="Zoom">
              {WINDOWS.map((w) => (
                <button key={w} type="button" aria-pressed={w === windowS} onClick={() => setWindowS(w)}>{w} s</button>
              ))}
              <button type="button" aria-pressed={windowS >= H} onClick={() => setWindowS(H)}>All</button>
            </div>
          </div>
          <ScanSpectrum scenario={scenario} run={run} fx={fx} cursor={cursor} windowS={windowS}
            decision={decision} nexts={nexts} height={SPECTRUM_H} onSeek={seek} />
          <div className={s.keys}>
            <span><i className={s.kLook} />where it listened</span>
            <span><i className={s.kFlash} />radar flash</span>
            <span><i className={s.kAhead} />upcoming flash</span>
            <span><i className={s.kCatch} />caught</span>
            <span><i className={s.kPred} />predicted next flash</span>
            <span><i className={s.kDec} />current look</span>
          </div>
          <PlayBar {...pb.bind} speeds={SPEEDS} />
        </section>
        <EquationPanel ex={decision} run={run} fx={fx} />
      </div>
      <SecondStrip cells={cells} cursor={cursor} onSeek={seek} />
    </>
  );
}
