"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Leaderboard from "@/components/Leaderboard";
import LineChart, { type Series } from "@/components/LineChart";
import ScenarioBrief from "@/components/ScenarioBrief";
import ScenarioPicker from "@/components/ScenarioPicker";
import SpectrumGrid from "@/components/SpectrumGrid";
import { MetricBars, Scorecard, WinnerBadges } from "@/components/results";
import { Card, PlayBar, SectionHeader } from "@/components/ui";
import {
  createRun, getCatalog, itemAtCursor, policyColor, policyDash, policyLabel,
  type Catalog, type Explanation, type RunPayload,
} from "@/lib/api";
import { usePlayback } from "@/lib/hooks";
import { MODE_VERB } from "@/components/explain/modes";

export default function MissionPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [scenario, setScenario] = useState("lockout");
  const [data, setData] = useState<RunPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCatalog().then(setCatalog).catch((e) => setError(String(e)));
  }, []);

  const turingId = useMemo(
    () => catalog?.scenarios.find((s) => s.id.startsWith("turing:"))?.id ?? null,
    [catalog],
  );

  const horizon = data?.scenario.horizon_s ?? 60;
  const pb = usePlayback(horizon);

  useEffect(() => {
    if (!data) return;
    pb.setCursor(0);
    pb.setPlaying(true);
    // restart when a new run id arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  const runAll = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = await createRun({ scenario });
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [scenario]);

  const policies = useMemo(() => data?.request.policies.filter((p) => data.runs[p]) ?? [], [data]);

  const series: Series[] = useMemo(() => {
    if (!data) return [];
    return policies.map((p) => {
      const tl = data.runs[p].timeline;
      return {
        key: p,
        label: policyLabel(p),
        color: policyColor(p),
        x: tl.t,
        y: tl.intercepted,
        dash: policyDash(p),
      };
    });
  }, [data, policies]);

  const smartScan = data?.runs.primes;
  const explanation = smartScan ? itemAtCursor(smartScan.explanations, pb.cursor) : undefined;
  const isTuring = scenario.startsWith("turing:");

  return (
    <div className="stack-lg">
      <SectionHeader
        as="h1"
        eyebrow="Mission"
        title="Run every receiver on one scenario"
        lede="Pick a scenario, run the full lineup against identical ground truth, then scrub the replay to watch flashes accumulate."
      />

      <section className="stack">
        <SectionHeader
          eyebrow="Step 1"
          title="Choose a scenario"
          lede="Five simulated missions plus one real-dataset scenario when the catalog has it."
        />
        <ScenarioPicker
          selected={scenario}
          onSelect={(id) => { setScenario(id); setData(null); setError(null); }}
          turingId={turingId}
          disabled={busy}
        />
        <ScenarioBrief id={scenario} scenario={data?.request.scenario === scenario ? data.scenario : undefined} />
        <div className="hstack">
          <button type="button" className="btn btn-lg" onClick={runAll} disabled={busy || !catalog}>
            {busy ? "Running…" : "Run all receivers"}
          </button>
          <span className="muted small">Seed 0 · perfect detection · lineup from the catalog</span>
        </div>
        {busy && (
          <div className="notice" role="status">
            Computing every receiver on this scenario
            {isTuring ? " (real-dataset runs can take a minute or two on first request; later runs use cache)" : ""}.
            Stay on this page — results appear when ready.
          </div>
        )}
        {error && <p className="error notice" role="alert">{error}</p>}
      </section>

      {data && (
        <>
          <section className="stack">
            <SectionHeader
              eyebrow="Step 2"
              title="Live race"
              lede="Bars re-rank at the playhead by flashes caught. Found counts sit beside each score."
            />
            <PlayBar {...pb.bind} />
            <Card title="Leaderboard" subtitle={`t = ${pb.cursor.toFixed(1)} s · same radars for every receiver`}>
              <Leaderboard data={data} cursor={pb.cursor} policies={policies} />
            </Card>
          </section>

          <section className="stack">
            <SectionHeader
              eyebrow="Step 3"
              title="Where each receiver listened"
              lede="Small multiples of the spectrum-time view, synced to the same cursor. Oracle is omitted here — it already knows every flash."
            />
            <SpectrumGrid data={data} cursor={pb.cursor} policies={policies} />
          </section>

          <section className="stack">
            <SectionHeader
              eyebrow="Step 4"
              title="Cumulative flashes caught"
              lede="Oracle is dashed — the physical upper bound when the schedule is known in advance."
            />
            <Card>
              <LineChart series={series} horizon={horizon} cursor={pb.cursor} height={240} />
            </Card>
          </section>

          {smartScan && (
            <section className="stack">
              <SectionHeader
                eyebrow="Smart Scan"
                title="What it decided just now"
                lede="Mode, frequency, dwell, and score terms at the playhead."
                actions={
                  <Link href={`/how-it-decides?run=${encodeURIComponent(data.id)}`} className="link-arrow">How it decides →</Link>
                }
              />
              <Card className="decision-strip">
                {explanation ? (
                  <DecisionStrip ex={explanation} />
                ) : (
                  <p className="muted" style={{ margin: 0 }}>No decision yet — press play.</p>
                )}
              </Card>
            </section>
          )}

          <section className="stack">
            <SectionHeader
              eyebrow="Step 5"
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
          className="badge badge-md badge-outline mode-badge"
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
