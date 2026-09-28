"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, PlayBar, SectionHeader } from "@/components/ui";
import { createRun, getModels, itemAtCursor, type ModelsPayload, type PolicyRun, type RunPayload } from "@/lib/api";
import { usePlayback } from "@/lib/hooks";
import { briefing } from "@/lib/scenarios";
import DqnCurve, { DqnPipeline, RlComparison } from "./DqnCurve";
import ModeTimeline, { ModeRules } from "./ModeTimeline";
import ModelsUsed from "./ModelsUsed";
import PipelineDiagram from "./PipelineDiagram";
import ScoreBreakdown from "./ScoreBreakdown";
import { MODES, MODE_LABEL, modeColor, type Mode } from "./modes";
import s from "./explain.module.css";

const SCENARIOS = [
  { id: "lockout", label: "Lock-out" },
  { id: "easy", label: "Easy" },
  { id: "mixed", label: "Mixed on/off" },
];

async function fetchRun(id: string): Promise<RunPayload> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(res.status === 404 ? "That run is not in the cache any more." : `${res.status}: ${res.statusText}`);
  return res.json();
}

type Loaded = { key: string; data?: RunPayload; error?: string };

export default function HowItDecides() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const runId = params.get("run");
  const scenario = params.get("scenario") ?? "lockout";
  const key = runId ? `run:${runId}` : `scenario:${scenario}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let alive = true;
    const k = runId ? `run:${runId}` : `scenario:${scenario}`;
    (runId ? fetchRun(runId) : createRun({ scenario, policies: ["primes"] }))
      .then((data) => { if (alive) setLoaded({ key: k, data }); })
      .catch((e: Error) => { if (alive) setLoaded({ key: k, error: e.message }); });
    return () => { alive = false; };
  }, [runId, scenario]);

  const [models, setModels] = useState<ModelsPayload | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  useEffect(() => {
    getModels().then(setModels).catch((e: Error) => setModelsError(e.message));
  }, []);

  const current = loaded?.key === key ? loaded : null;
  const run = current?.data?.runs.primes;
  const pickScenario = (id: string) => router.replace(`${pathname}?scenario=${id}`, { scroll: false });

  return (
    <div className="stack-lg">
      <div>
        <SectionHeader as="h1" eyebrow="How it decides" title="Predict, then score every look"
          lede="Every few milliseconds Smart Scan asks one question: of all the places and durations it could listen next, which buys the most per second? It answers with explicit models of each radar, not a black box." />
        <div className={s.callout} style={{ marginTop: 24 }}>
          <Card variant="tint">
            <h3>One score, not many algorithms</h3>
            <p>Smart Scan is a single predict-then-score loop. It does not switch between algorithms: Search, Track and Extend are labels for what the same score picked.</p>
          </Card>
          <Card variant="tint">
            <h3>Models where physics is known</h3>
            <p>Radar timing is modelled explicitly (periodic flashes or on/off bursts) and learned from 2–3 catches, with priors fit from a real radar dataset.</p>
          </Card>
          <Card variant="tint">
            <h3>Reinforcement learning as the rival</h3>
            <p>Double-DQN learns where to listen from reward alone, with no radar model. It runs as a separate receiver in the lineup so the two approaches can be compared.</p>
          </Card>
        </div>
      </div>

      {run && current?.data ? (
        <Replay key={key} run={run} payload={current.data} scenario={runId ? null : scenario} onScenario={pickScenario} />
      ) : (
        <>
          <section>
            <SectionHeader eyebrow="The loop" title="Five steps per decision" />
            <Card pad="lg"><PipelineDiagram /></Card>
          </section>
          <section>
            <SectionHeader eyebrow="Live replay" title="Watch it decide"
              actions={runId ? undefined : <ScenarioPicker value={scenario} onChange={pickScenario} />} />
            {!current && (
              <div className="notice">
                Replaying Smart Scan on the {SCENARIOS.find((x) => x.id === scenario)?.label ?? scenario} scenario.
                The first replay takes up to a minute; after that it is cached.
              </div>
            )}
            {current?.error && (
              <div className="notice error">
                Could not load the replay: {current.error}{" "}
                {runId && <Link href={pathname} className="link-arrow">Load the demo run instead</Link>}
              </div>
            )}
            {current?.data && !run && (
              <div className="notice">
                This run has no Smart Scan lane. <Link href={pathname} className="link-arrow">Load the demo run</Link>
              </div>
            )}
          </section>
        </>
      )}

      <section>
        <SectionHeader eyebrow="Under the hood" title="Models used"
          lede="Which parts are learned, where they are learned from, and which scheduler uses them." />
        {models ? <ModelsUsed models={models.models} />
          : modelsError ? <div className="notice error">Could not load the model list: {modelsError}</div>
          : <div className="notice">Loading models…</div>}
      </section>

      <section>
        <SectionHeader eyebrow="The comparator" title="Double-DQN: learning from reward alone"
          lede="A deep reinforcement learning scheduler trained on the same simulator with the same objective. It maps a history of looks straight to an action, without modelling any radar." />
        <div className="stack">
          <Card><DqnPipeline /></Card>
          <div className="grid-2">
            <Card title="Training curve" subtitle="How the comparator improved during training">
              {models ? <DqnCurve curve={models.dqn_curve} /> : <div className="notice">{modelsError ? "Unavailable." : "Loading…"}</div>}
            </Card>
            <Card title="Smart Scan vs Double-DQN" subtitle="Same receiver, same reward, different ways of deciding">
              <RlComparison />
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

function ScenarioPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Scenario">
      {SCENARIOS.map((x) => (
        <button key={x.id} type="button" aria-pressed={x.id === value} onClick={() => onChange(x.id)}>{x.label}</button>
      ))}
    </div>
  );
}

function Replay({ run, payload, scenario, onScenario }: {
  run: PolicyRun; payload: RunPayload; scenario: string | null; onScenario: (id: string) => void;
}) {
  const ex = run.explanations;
  const pb = usePlayback(payload.scenario.horizon_s, 2);
  const { setCursor } = pb;
  const firstTrack = useMemo(() => ex.find((e) => e.mode === "track")?.t ?? 0, [ex]);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    setCursor(firstTrack);
  }, [setCursor, firstTrack]);

  const now = itemAtCursor(ex, pb.cursor);
  const jump = (m: Mode) => {
    const next = ex.find((e) => e.mode === m && e.t > pb.cursor + 1e-4) ?? ex.find((e) => e.mode === m);
    if (next) { pb.setPlaying(false); pb.setCursor(next.t); }
  };
  const has = (m: Mode) => ex.some((e) => e.mode === m);

  return (
    <>
      <section>
        <SectionHeader eyebrow="The loop" title="Five steps per decision"
          lede="The highlighted mode follows the playback cursor below." />
        <Card pad="lg"><PipelineDiagram activeMode={now?.mode ?? null} /></Card>
      </section>

      <section className="stack">
        <SectionHeader eyebrow="Live replay" title="Watch it decide"
          lede={`${briefing(payload.request.scenario).title}. Every one of Smart Scan's ${ex.length.toLocaleString()} decisions, with the numbers behind it.`}
          actions={scenario ? <ScenarioPicker value={scenario} onChange={onScenario} /> : undefined} />
        <PlayBar {...pb.bind} />
        <div className="hstack" style={{ gap: 8 }}>
          <span className="muted small">Jump to the next</span>
          {MODES.map((m) => (
            <button key={m} type="button" className="btn secondary" style={{ height: 34, fontSize: 14 }} disabled={!has(m)} onClick={() => jump(m)}>
              <span className="swatch" style={{ background: modeColor(m) }} />{MODE_LABEL[m]} decision
            </button>
          ))}
        </div>
        <Card title="Mode over time" subtitle="Click or drag to move the cursor. The line below counts how many emitters Smart Scan is tracking.">
          <ModeTimeline explanations={ex} horizon={payload.scenario.horizon_s} cursor={pb.cursor} onSeek={(t) => { pb.setPlaying(false); pb.setCursor(t); }} />
        </Card>
        <div className="grid-2">
          <Card title="Why this look" subtitle="The decision in force at the cursor">
            <ScoreBreakdown explanations={ex} cursor={pb.cursor} />
          </Card>
          <Card title="The three modes" subtitle="Which rule applied at the cursor">
            <ModeRules active={now?.mode ?? null} />
          </Card>
        </div>
      </section>
    </>
  );
}
