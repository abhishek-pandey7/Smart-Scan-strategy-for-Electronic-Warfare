"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Leaderboard from "@/components/Leaderboard";
import LineChart, { type Series } from "@/components/LineChart";
import ScenarioBrief from "@/components/ScenarioBrief";
import ScenarioPicker from "@/components/ScenarioPicker";
import SpectrumGrid from "@/components/SpectrumGrid";
import { MetricBars, Scorecard, WinnerBadges } from "@/components/results";
import { Card, SectionHeader } from "@/components/ui";
import {
  atCursor, createRun, getCatalog, isReference, itemAtCursor, policyColor, policyDash, policyLabel,
  type Catalog, type Explanation, type RunPayload,
} from "@/lib/api";
import { SPEEDS, usePlayback, type Playback } from "@/lib/hooks";
import { briefing } from "@/lib/scenarios";
import { MODE_VERB } from "@/components/explain/modes";
import styles from "./mission.module.css";

/** Spectrum boxes 1-5, in this order; box 6 is the cumulative chart. */
const SPECTRUM_ORDER = ["primes", "dqn", "greedy", "raster", "random"] as const;

export default function MissionPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [scenario, setScenario] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [data, setData] = useState<RunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLElement>(null);
  const simRef = useRef<HTMLElement>(null);
  const request = useRef(0);
  const scrollOnLoad = useRef(false);
  const busy = pending !== null;

  useEffect(() => {
    getCatalog().then(setCatalog).catch((e) => setError(String(e)));
  }, []);

  // The simulator is sized to the viewport minus the sticky site header, whatever its current height.
  useEffect(() => {
    const root = rootRef.current;
    const header = document.querySelector<HTMLElement>("body > header, header.topbar");
    if (!root || !header) return;
    const update = () => {
      const pos = getComputedStyle(header).position;
      const h = pos === "sticky" || pos === "fixed" ? header.getBoundingClientRect().height : 0;
      root.style.setProperty("--mission-header-h", `${Math.ceil(h)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const turingId = useMemo(
    () => catalog?.scenarios.find((s) => s.id.startsWith("turing:"))?.id ?? null,
    [catalog],
  );

  const horizon = data?.scenario.horizon_s ?? 60;
  const pb = usePlayback(horizon);
  const { restart } = pb;

  const scrollToSim = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    simRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  const runId = data?.id;
  useEffect(() => {
    if (!runId) return;
    restart();
    if (!scrollOnLoad.current) return;
    scrollOnLoad.current = false;
    const raf = requestAnimationFrame(scrollToSim);
    return () => cancelAnimationFrame(raf);
  }, [runId, restart, scrollToSim]);

  const pick = useCallback(async (id: string) => {
    setScenario(id);
    setError(null);
    if (data?.request.scenario === id) { scrollToSim(); return; }
    const req = ++request.current;
    setPending(id);
    try {
      const payload = await createRun({ scenario: id });
      if (req !== request.current) return;
      scrollOnLoad.current = true;
      setData(payload);
    } catch (e) {
      if (req === request.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (req === request.current) setPending(null);
    }
  }, [data, scrollToSim]);

  const policies = useMemo(() => data?.request.policies.filter((p) => data.runs[p]) ?? [], [data]);
  const spectrumIds = useMemo(() => SPECTRUM_ORDER.filter((p) => data?.runs[p]), [data]);
  const chartIds = useMemo(() => {
    const rest = policies.filter((p) => !(SPECTRUM_ORDER as readonly string[]).includes(p));
    return [...spectrumIds, ...rest.filter((p) => !isReference(p)), ...rest.filter(isReference)];
  }, [policies, spectrumIds]);

  const series: Series[] = useMemo(() => {
    if (!data) return [];
    return chartIds.map((p) => {
      const tl = data.runs[p].timeline;
      return { key: p, label: policyLabel(p), color: policyColor(p), x: tl.t, y: tl.intercepted, dash: policyDash(p) };
    });
  }, [data, chartIds]);

  const smartScan = data?.runs.primes;
  const explanation = smartScan ? itemAtCursor(smartScan.explanations, pb.cursor) : undefined;
  const isTuring = (pending ?? scenario ?? "").startsWith("turing:");
  const runScenario = data?.request.scenario;
  const b = runScenario ? briefing(runScenario) : null;

  return (
    <div ref={rootRef} className="stack-lg">
      <SectionHeader
        as="h1"
        eyebrow="Mission"
        title="Run every receiver on one scenario"
        lede="Pick a scenario and the full lineup runs against identical ground truth. The simulator opens below: scrub, reverse, or speed up the replay to watch flashes accumulate."
      />

      <section ref={pickerRef} className="stack" style={{ scrollMarginTop: "calc(var(--mission-header-h, 68px) + 16px)" }}>
        <SectionHeader
          eyebrow="Step 1"
          title="Choose a scenario"
          lede="Five simulated missions plus one real-dataset scenario when the catalog has it. Selecting one runs every receiver."
        />
        <ScenarioPicker
          selected={scenario ?? ""}
          onSelect={pick}
          turingId={turingId}
          disabled={busy || !catalog}
          pendingId={pending}
        />
        <span className="muted small">Seed 0 · perfect detection · lineup from the catalog</span>
        {busy && (
          <div className="notice" role="status">
            Computing every receiver on this scenario
            {isTuring ? " (real-dataset runs can take a minute or two on first request; later runs use cache)" : ""}.
            Stay on this page. The simulator opens when results are ready.
          </div>
        )}
        {error && <p className="error notice" role="alert">{error}</p>}
      </section>

      {data && b && (
        <>
          <section ref={simRef} className={styles.sim} aria-label="Simulator">
            <div className={`${styles.box} ${styles.title}`}>
              <div className={styles.titleText}>
                <div className={styles.eyebrow}>{data.request.scenario.startsWith("turing:") ? "Real dataset" : "Simulated scenario"}</div>
                <h2 className={styles.scenarioName}>{b.title}</h2>
                <p className={styles.tagline}>
                  {b.tagline ?? b.tests} · {data.scenario.emitters.length} emitters · seed {data.request.seed}
                </p>
              </div>
              <div className={styles.clock} aria-live="off">
                <div className={styles.clockNow}>t = {pb.cursor.toFixed(1)} s</div>
                <div className={styles.clockOf}>of {horizon.toFixed(0)} s mission</div>
              </div>
              <button type="button" className={styles.linkBtn}
                onClick={() => pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                Change scenario ↑
              </button>
            </div>

            <TimeControls pb={pb} className={`${styles.box} ${styles.controls}`} />

            <aside className={`${styles.box} ${styles.board}`} aria-label="Live leaderboard">
              <div className={styles.boardHead}>
                <h3>Live leaderboard</h3>
                <span className="mono muted small">t = {pb.cursor.toFixed(1)} s</span>
              </div>
              <p className={styles.boardSub}>Ranked by flashes caught at the playhead. Same radars for every receiver.</p>
              <Leaderboard data={data} cursor={pb.cursor} policies={policies} compact />
              <BoardStats data={data} cursor={pb.cursor} />
              <div className={styles.key}>
                <span className={styles.keyTitle}>Reading the spectrum views</span>
                <span className={styles.keyItem}><span className={styles.keyBand} />Shaded band: where the receiver listened</span>
                <span className={styles.keyItem}><span className={styles.keyTruth} />Grey tick: a radar flash (ground truth)</span>
                <span className={styles.keyItem}><span className={styles.keyDot} />Dot: a flash the receiver caught</span>
              </div>
            </aside>

            <SpectrumGrid data={data} cursor={pb.cursor} policies={spectrumIds} fill
              className={styles.grid} cellClassName={`${styles.box} ${styles.cell}`}>
              <div className={`${styles.box} ${styles.cell}`}>
                <div className={styles.cellHead}>
                  <strong>Flashes caught</strong>
                  <span className="muted small">cumulative, Oracle dashed</span>
                </div>
                <div className={styles.cellBody}>
                  <span className={styles.legend} aria-hidden>
                    {series.map((s) => (
                      <span key={s.key} className={styles.legendKey}>
                        {s.dash ? (
                          <svg width={18} height={8} aria-hidden>
                            <line x1={1} x2={17} y1={4} y2={4} stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="4 3" />
                          </svg>
                        ) : (
                          <span className="swatch" style={{ background: s.color, width: 10, height: 10 }} />
                        )}
                        {s.label}
                      </span>
                    ))}
                  </span>
                  <LineChart series={series} horizon={horizon} cursor={pb.cursor} fill legend={false} />
                </div>
              </div>
            </SpectrumGrid>
          </section>

          {smartScan && (
            <section className="stack">
              <SectionHeader
                eyebrow="Smart Scan"
                title="What it decided just now"
                lede="Mode, frequency, dwell, and score terms at the playhead. Synced to the simulator above."
                actions={
                  <Link href={`/how-it-decides?run=${encodeURIComponent(data.id)}`} className="link-arrow">How it decides →</Link>
                }
              />
              <Card>
                {explanation ? (
                  <DecisionStrip ex={explanation} />
                ) : (
                  <p className="muted" style={{ margin: 0 }}>No decision yet. Press play.</p>
                )}
              </Card>
            </section>
          )}

          <section className="stack">
            <SectionHeader
              eyebrow="Scenario"
              title="About this scenario"
              lede="What is in it, what it tests, and what to watch for in the replay."
            />
            <ScenarioBrief id={data.request.scenario} scenario={data.scenario} />
          </section>

          <section className="stack">
            <SectionHeader
              eyebrow="Results"
              title="Who wins what"
              lede="Final metrics across the lineup once the mission is complete."
            />
            <div className="stack">
              <WinnerBadges data={data} />
              <MetricBars data={data} />
              <Scorecard data={data} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

const ICON = {
  start: "M2 1.5h2v11H2zM12 1.8v10.4a.7.7 0 0 1-1.1.6L4.6 7.6a.7.7 0 0 1 0-1.2l6.3-5.2a.7.7 0 0 1 1.1.6z",
  end: "M10 1.5h2v11h-2zM2 1.8v10.4a.7.7 0 0 0 1.1.6l6.3-5.2a.7.7 0 0 0 0-1.2L3.1 1.2A.7.7 0 0 0 2 1.8z",
  forward: "M3 1.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 3 1.5z",
  reverse: "M11 1.5v11a.8.8 0 0 1-1.2.7l-9-5.5a.8.8 0 0 1 0-1.4l9-5.5A.8.8 0 0 1 11 1.5z",
  pause: "M2.5 1h3.5v12H2.5zM8 1h3.5v12H8z",
};

function TimeControls({ pb, className }: { pb: Playback; className?: string }) {
  const { cursor, horizon, playing, direction, speed } = pb;
  const fwd = playing && direction > 0;
  const rev = playing && direction < 0;
  const progress = horizon ? (100 * Math.min(cursor, horizon)) / horizon : 0;
  const seek = (t: number) => { pb.setPlaying(false); pb.setCursor(t); };
  return (
    <div className={className} role="group" aria-label="Time controls">
      <div className={styles.controlsRow}>
        <div className={styles.transport}>
          <button type="button" className={styles.tbtn} aria-label="Jump to start" title="Jump to start"
            disabled={cursor <= 0} onClick={() => seek(0)}><Icon d={ICON.start} /></button>
          <button type="button" className={styles.tbtn} aria-pressed={rev} aria-label={rev ? "Pause" : "Play in reverse"}
            title={rev ? "Pause" : "Play in reverse"} onClick={() => (rev ? pb.setPlaying(false) : pb.play(-1))}>
            <Icon d={rev ? ICON.pause : ICON.reverse} />
          </button>
          <button type="button" className={styles.tbtn} aria-pressed={fwd} aria-label={fwd ? "Pause" : "Play forward"}
            title={fwd ? "Pause" : "Play forward"} onClick={() => (fwd ? pb.setPlaying(false) : pb.play(1))}>
            <Icon d={fwd ? ICON.pause : ICON.forward} />
          </button>
          <button type="button" className={styles.tbtn} aria-label="Jump to end" title="Jump to end"
            disabled={cursor >= horizon} onClick={() => seek(horizon)}><Icon d={ICON.end} /></button>
        </div>
        <div className={`segmented ${styles.speeds}`} role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button type="button" key={s} aria-pressed={s === speed} onClick={() => pb.setSpeed(s)}>{s}x</button>
          ))}
        </div>
      </div>
      <div className={styles.scrubRow}>
        <input type="range" min={0} max={horizon} step={0.05} value={Math.min(cursor, horizon)}
          aria-label="Playback time" className={`playbar-range ${styles.scrub}`}
          style={{ ["--progress" as string]: `${progress}%` }}
          onChange={(e) => seek(Number(e.target.value))} />
        <span className={styles.time}>
          {cursor.toFixed(1)}<span className="muted"> / {horizon.toFixed(0)} s</span>
        </span>
      </div>
    </div>
  );
}

function BoardStats({ data, cursor }: { data: RunPayload; cursor: number }) {
  const caught = (p: string) => (data.runs[p] ? atCursor(data.runs[p].timeline, cursor).intercepted : null);
  const ours = caught("primes");
  if (ours === null) return null;
  const oracle = caught("oracle");
  const rival = SPECTRUM_ORDER.filter((p) => p !== "primes" && data.runs[p])
    .map((p) => ({ p, v: caught(p) ?? 0 }))
    .sort((x, y) => y.v - x.v)[0];
  const lead = rival ? ours - rival.v : null;
  return (
    <div className={styles.stats}>
      {oracle !== null && (
        <div className={styles.stat}>
          <div className={styles.statValue}>{oracle > 0 ? `${Math.round((100 * ours) / oracle)}%` : "–"}</div>
          <div className={styles.statLabel}>of Oracle&apos;s flashes caught by Smart Scan</div>
        </div>
      )}
      {rival && lead !== null && (
        <div className={styles.stat}>
          <div className={styles.statValue} style={{ color: lead > 0 ? "var(--good)" : lead < 0 ? "var(--critical)" : undefined }}>
            {lead > 0 ? `+${lead}` : lead}
          </div>
          <div className={styles.statLabel}>Smart Scan lead over {policyLabel(rival.p)}</div>
        </div>
      )}
    </div>
  );
}

function DecisionStrip({ ex }: { ex: Explanation }) {
  const terms = [
    { label: "Exploit", value: ex.terms.exploit },
    { label: "Discovery", value: ex.terms.discovery },
    { label: "Info gain", value: ex.terms.info_gain },
  ];
  const max = Math.max(...terms.map((t) => t.value), 1e-9);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="hstack">
        <span
          className={`badge badge-md badge-outline ${styles.decisionBadge}`}
          style={{ color: `var(--mode-${ex.mode})`, borderColor: `var(--mode-${ex.mode})` }}
        >
          {MODE_VERB[ex.mode]}
        </span>
        <span className="mono muted">t = {ex.t.toFixed(2)} s</span>
        <span className="muted">·</span>
        <strong className="mono">{(ex.centre_mhz / 1000).toFixed(2)} GHz</strong>
        <span className="muted">for</span>
        <strong className="mono">{ex.dwell_ms} ms</strong>
        {ex.track && (
          <>
            <span className="muted">·</span>
            <span className="muted">
              emitter {ex.track.emitter}
              {ex.track.next_flash_in_ms !== null ? ` in ${ex.track.next_flash_in_ms.toFixed(0)} ms` : " visible"}
              {" · "}P = {ex.track.p.toFixed(2)}
            </span>
          </>
        )}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {terms.map((t) => (
          <div key={t.label} className="term">
            <span className="muted">{t.label}</span>
            <span style={{ background: "var(--surface-2)", borderRadius: 4 }}>
              <span
                className="bar"
                style={{
                  display: "block",
                  width: `${(100 * t.value) / max}%`,
                  minWidth: t.value > 0 ? 2 : 0,
                  background: `var(--mode-${ex.mode})`,
                }}
              />
            </span>
            <span className="mono" style={{ textAlign: "right" }}>{t.value.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
