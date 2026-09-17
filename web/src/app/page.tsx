"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import LineChart from "@/components/LineChart";
import SpectrumCanvas from "@/components/SpectrumCanvas";
import { DecisionPanel, TrackTable } from "@/components/DecisionPanel";
import HeadToHead from "@/components/HeadToHead";
import ScenarioBrief from "@/components/ScenarioBrief";
import { briefing } from "@/lib/scenarios";
import {
  type Catalog, type RunPayload, createRun, getCatalog, isPrimes, num, pct, policyColor, policyLabel, POLICY_SLOT,
} from "@/lib/api";

const SPEEDS = [1, 4, 10];
const FALSE_ALARMS = [
  { value: 0, label: "None" },
  { value: 0.005, label: "Realistic (~20 per run)" },
  { value: 0.02, label: "Heavy (~70 per run)" },
];

export default function ReplayPage() {
  return (
    <Suspense fallback={<h1>Mission replay</h1>}>
      <Replay />
    </Suspense>
  );
}

function Replay() {
  // Shareable demo links: /?scenario=lockout&seed=0&a=raster&b=primes&pd=1&fa=0&autorun=1&t=60
  const params = useSearchParams();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [scenario, setScenario] = useState(params.get("scenario") ?? "lockout");
  const [seed, setSeed] = useState(Number(params.get("seed") ?? 0));
  const [policyA, setPolicyA] = useState(params.get("a") ?? "raster");
  const [policyB, setPolicyB] = useState(params.get("b") ?? "primes");
  const [pD, setPD] = useState(Number(params.get("pd") ?? 1));
  const [pFa, setPFa] = useState(Number(params.get("fa") ?? 0));
  const [data, setData] = useState<RunPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const raf = useRef<number | null>(null);

  useEffect(() => { getCatalog().then(setCatalog).catch((e) => setError(String(e))); }, []);

  const execute = useCallback(async (req: { scenario: string; seed: number; a: string; b: string; pD: number; pFa: number }, startAt?: number) => {
    setLoading(true); setError(null); setPlaying(false);
    try {
      const policies = Array.from(new Set([req.a, req.b]));
      const payload = await createRun({ scenario: req.scenario, seed: req.seed, policies, p_d: req.pD, p_fa: req.pFa });
      setData(payload);
      setCursor(startAt ?? 0);
      setPlaying(startAt === undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const run = () => execute({ scenario, seed, a: policyA, b: policyB, pD, pFa });

  const autorun = params.has("autorun");
  const startAt = params.has("t") ? Number(params.get("t")) : undefined;
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!catalog || !autorun || autoStarted.current) return;
    autoStarted.current = true;
    void execute({ scenario, seed, a: policyA, b: policyB, pD, pFa }, startAt);
  }, [catalog, autorun, startAt, execute]); // eslint-disable-line react-hooks/exhaustive-deps

  const horizon = data?.scenario.horizon_s ?? 60;
  const cursorRef = useRef(0);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(horizon, cursorRef.current + ((now - last) / 1000) * speed);
      last = now;
      cursorRef.current = next;
      setCursor(next);
      if (next >= horizon) { setPlaying(false); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, speed, horizon]);

  const shown = useMemo(() => (data ? Object.keys(data.runs) : []), [data]);
  // explanation panels follow a PRIMES receiver (B first, since B is PRIMES in the default comparison)
  const primesName = [policyB, policyA].find((p) => isPrimes(p) && data?.runs[p]);
  const primesRun = primesName ? data?.runs[primesName] : undefined;
  const selfSorted = shown.filter((p) => typeof data?.runs[p].metrics.association_purity === "number");

  const series = (key: "intercepted" | "discovered") =>
    shown.map((p) => ({ key: p, label: policyLabel(p), color: policyColor(p), x: data!.runs[p].timeline.t, y: data!.runs[p].timeline[key] }));

  const policyOptions = catalog?.policies ?? [];

  return (
    <>
      <h1>Mission replay</h1>
      <p className="sub">
        Two receivers face exactly the same radars. One scans the old way, one uses PRIMES. Watch which one catches more.
      </p>

      <div className="card controls">
        <div className="field">
          <label htmlFor="scn">Scenario</label>
          <select id="scn" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {(catalog?.scenarios ?? [{ id: scenario, description: "" }]).map((s) => (
              <option key={s.id} value={s.id}>{briefing(s.id).short}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="seed">Variant</label>
          <input id="seed" type="number" min={0} max={999} value={seed} disabled={scenario.startsWith("turing:")}
            onChange={(e) => setSeed(Math.max(0, Number(e.target.value)))} style={{ minWidth: 80, width: 80 }} />
        </div>
        {[["Receiver A", policyA, setPolicyA], ["Receiver B", policyB, setPolicyB]].map(([label, value, set]) => (
          <div className="field" key={label as string}>
            <label>{label as string}</label>
            <select value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}>
              {policyOptions.map((p) => <option key={p.id} value={p.id}>{policyLabel(p.id)}</option>)}
            </select>
          </div>
        ))}
        <div className="field">
          <label htmlFor="pd">Detection reliability</label>
          <select id="pd" value={pD} onChange={(e) => setPD(Number(e.target.value))}>
            {[1, 0.9, 0.7, 0.5].map((v) => <option key={v} value={v}>{v === 1 ? "1 (every flash in view)" : v}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fa">False alarms</label>
          <select id="fa" value={pFa} onChange={(e) => setPFa(Number(e.target.value))}>
            {FALSE_ALARMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <button className="btn" onClick={run} disabled={loading || !catalog}>
          {loading ? "Running replay…" : "Run replay"}
        </button>
      </div>

      <ScenarioBrief id={scenario} scenario={data && data.request.scenario === scenario ? data.scenario : undefined} />

      {error && <p className="error">{error}</p>}
      {loading && (
        <p className="notice">
          Replaying both schedulers against the hidden truth. Large Turing scenarios take up to a minute the first time; results are cached.
        </p>
      )}

      {data && (
        <div className="stack">
          <div className="explainer">
            <div><strong>The radars</strong><span className="muted">Rotating radars only point at us for a brief &ldquo;flash&rdquo; every few seconds. Each flash is a chance to detect them.</span></div>
            <div><strong>The receiver</strong><span className="muted">It can listen to only one small slice of the spectrum at a time, so it must choose where and when to listen.</span></div>
            <div><strong>The score</strong><span className="muted">A flash counts only if the receiver was listening on the right frequency at that moment. More caught = better awareness.</span></div>
          </div>

          <HeadToHead data={data} a={policyA} b={policyB === policyA ? policyA : policyB} cursor={cursor} />

          <div className="card playbar">
            <button className="btn ghost" onClick={() => { if (cursor >= horizon) setCursor(0); setPlaying(!playing); }}>
              {playing ? "Pause" : cursor >= horizon ? "Replay" : "Play"}
            </button>
            <input type="range" min={0} max={horizon} step={0.05} value={cursor} aria-label="Playback time"
              onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} />
            <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 70 }}>{cursor.toFixed(1)} / {horizon} s</span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
              {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
          </div>

          {selfSorted.length > 0 && (
            <div className="notice">
              <strong>Raw pulses mode:</strong> {selfSorted.map(policyLabel).join(", ")} received unlabelled pulses and sorted them into radars itself
              (by bearing and frequency) before deciding where to listen. Its track numbers are its own; the table below shows which real radar each one turned out to be.
            </div>
          )}

          <h2 style={{ marginTop: 8 }}>Final results for the whole run</h2>
          <div className="tiles">
            {[
              { label: "Radar flashes caught", fmt: (p: string) => pct(data.runs[p].metrics.interception_ratio) },
              { label: "Radars found", fmt: (p: string) => `${data.runs[p].metrics.emitters_discovered} of ${data.runs[p].metrics.emitters}` },
              { label: "Average time to first catch", fmt: (p: string) => num(data.runs[p].metrics.ttfi_mean_s, 1, " s") },
              { label: "Next flash predicted correctly", fmt: (p: string) => num(data.runs[p].metrics.prediction_correct_pct, 0, "%") },
              ...(selfSorted.length ? [{ label: "Pulses sorted to the right radar", fmt: (p: string) => pct(data.runs[p].metrics.association_purity) }] : []),
              ...(data.request.p_fa > 0 ? [{ label: "False alarms heard", fmt: (p: string) => num(data.runs[p].metrics.false_alarms, 0) }] : []),
            ].map((tile) => (
              <div className="tile" key={tile.label}>
                <div className="label">{tile.label}</div>
                <div className="rows">
                  {shown.map((p) => (
                    <div className="row" key={p}>
                      <span className="key"><span className="swatch" style={{ background: policyColor(p) }} />{policyLabel(p)}</span>
                      <span className="value">{tile.fmt(p)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {shown.map((p) => {
            const tl = data.runs[p].timeline;
            const i = Math.max(0, Math.min(tl.t.length - 1, Math.floor(cursor / (tl.t[1] - tl.t[0] || 0.25))));
            return (
            <div className="card" key={p}>
              <h2>
                <span className="swatch" style={{ background: policyColor(p), marginRight: 8 }} />{policyLabel(p)}
                <span className="live-count">caught {tl.intercepted[i]} flashes · found {tl.discovered[i]} radars</span>
              </h2>
              <p className="sub" style={{ marginBottom: 8 }}>
                Coloured bands = where this receiver listened · grey ticks = radar flashes that happened · dots = flashes it caught
              </p>
              <SpectrumCanvas scenario={data.scenario} run={data.runs[p]} cursor={cursor} colorVar={`--series-${POLICY_SLOT[p] ?? 7}`} />
            </div>
            );
          })}

          <div className="grid-2">
            <div className="card">
              <h2>Radar flashes caught over time</h2>
              <LineChart series={series("intercepted")} horizon={horizon} cursor={cursor} format={(v) => v.toFixed(0)} />
            </div>
            <div className="card">
              <h2>Radars found over time</h2>
              <LineChart series={series("discovered")} horizon={horizon} cursor={cursor} format={(v) => v.toFixed(0)} />
            </div>
          </div>

          {primesRun && (
            <div className="grid-2">
              <div className="card">
                <h2>Why {policyLabel(primesName!)} looked there</h2>
                <p className="sub" style={{ marginBottom: 10 }}>PRIMES explains every choice: what it expected to catch there, and why it beat the alternatives.</p>
                <DecisionPanel run={primesRun} cursor={cursor} />
              </div>
              <div className="card">
                <h2>What {policyLabel(primesName!)} has learned</h2>
                <p className="sub" style={{ marginBottom: 10 }}>Radars PRIMES has worked out on its own, from what it caught and missed. No prior intelligence.</p>
                <TrackTable run={primesRun} emitters={data.scenario.emitters} cursor={cursor} />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
