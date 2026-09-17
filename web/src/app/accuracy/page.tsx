"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PointChart from "@/components/PointChart";
import { type Accuracy, getAccuracy, policyColor, policyLabel } from "@/lib/api";

const GROUPS: { id: string; label: string }[] = [
  { id: "lockout", label: "Lock-out" },
  { id: "easy", label: "Easy" },
  { id: "popup", label: "Pop-up" },
  { id: "dense", label: "Dense (40 emitters)" },
  { id: "mixed", label: "Mixed" },
  { id: "turing", label: "Real dataset scenarios" },
];
const groupLabel = (g: string) => GROUPS.find((x) => x.id === g)?.label ?? g;
const pct = (v: number | null | undefined, d = 0) => (typeof v === "number" ? `${(v * 100).toFixed(d)}%` : "–");

const P_D = [
  { id: "nominal", label: "1.0" }, { id: "p_d=0.9", label: "0.9" }, { id: "p_d=0.7", label: "0.7" }, { id: "p_d=0.5", label: "0.5" },
];
const P_FA = [
  { id: "nominal", label: "none" }, { id: "p_fa=0.001", label: "~5 / run" }, { id: "p_fa=0.005", label: "~23 / run" },
  { id: "p_fa=0.02", label: "~70 / run" },
];
const ROB_POLICIES = ["oracle", "primes", "greedy", "raster"];

export default function AccuracyPage() {
  const [acc, setAcc] = useState<Accuracy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lossPolicy, setLossPolicy] = useState("primes");
  const [robGroup, setRobGroup] = useState<"all" | "turing">("all");

  useEffect(() => { getAccuracy().then(setAcc).catch((e) => setError(String(e))); }, []);

  const get = useMemo(() => (group: string, policy: string) =>
    acc?.breakdown.find((b) => b.group === group && b.policy === policy), [acc]);

  const robSeries = (conds: { id: string }[]) => ROB_POLICIES.map((p) => ({
    key: p, label: policyLabel(p), color: policyColor(p), bold: p === "primes",
    y: conds.map((c) => acc?.robustness?.summary.find((e) => e.condition === c.id && e.group === robGroup && e.policy === p)
      ?.interception_ratio.mean ?? null),
  }));

  return (
    <>
      <h1>Understanding the accuracy</h1>
      <p className="sub">
        Why PRIMES scores 60–80% and not 100%, where the missing flashes go, and how the score holds up when conditions get worse.
      </p>
      {error && <p className="notice">{error}</p>}

      <div className="explainer" style={{ marginBottom: 16 }}>
        <div>
          <strong>What the score is</strong>
          <span className="muted">The share of <em>every</em> radar flash in the mission that the receiver caught. It is not &ldquo;percent of decisions correct&rdquo;.</span>
        </div>
        <div>
          <strong>Why 100% is impossible</strong>
          <span className="muted">The receiver hears about 1 GHz of an 18 GHz spectrum at a time. Flashes on other bands, or from radars nobody has found yet, happen while it listens elsewhere.</span>
        </div>
        <div>
          <strong>The fair comparison</strong>
          <span className="muted">Against today&apos;s fixed sweep, and against a clairvoyant oracle that is handed the truth. Even the oracle cannot reach 100%.</span>
        </div>
      </div>

      {acc && (
        <div className="stack">
          <div className="card">
            <h2>The scale that matters</h2>
            <p className="sub" style={{ marginBottom: 12 }}>
              Share of flashes caught, per scenario. The oracle marks the practical ceiling for a single receiver.
            </p>
            <div className="scale">
              {GROUPS.map((g) => {
                const r = get(g.id, "raster"), p = get(g.id, "primes"), o = get(g.id, "oracle");
                if (!r || !p || !o) return null;
                return (
                  <div key={g.id} className="scale-row">
                    <div className="scale-name">{g.label}</div>
                    <div className="scale-bars">
                      {[["raster", r.caught], ["primes", p.caught], ["oracle", o.caught]].map(([pol, v]) => (
                        <div key={pol as string} className="scale-bar">
                          <span className="h2h-track">
                            <span className="h2h-fill" style={{ width: `${(v as number) * 100}%`, background: policyColor(pol as string) }} />
                          </span>
                          <span className="scale-value">{pct(v as number, 1)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="scale-ratios">
                      <span><strong>{(p.caught / o.caught).toFixed(2)}</strong> <span className="muted">of oracle</span></span>
                      <span><strong>{(p.caught / Math.max(r.caught, 1e-9)).toFixed(0)}×</strong> <span className="muted">fixed sweep</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="legend" style={{ marginTop: 8 }}>
              {["raster", "primes", "oracle"].map((p) => (
                <span key={p} className="key"><span className="swatch" style={{ background: policyColor(p) }} />{policyLabel(p)}</span>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2>Where the missing flashes go</h2>
                <p className="sub" style={{ marginBottom: 0 }}>Every flash is either caught, lost before the radar was first found, or missed while it was already being tracked.</p>
              </div>
              <div className="field">
                <label htmlFor="lossp">Scheduler</label>
                <select id="lossp" value={lossPolicy} onChange={(e) => setLossPolicy(e.target.value)}>
                  {["primes", "oracle", "dqn", "greedy", "raster"].map((p) => <option key={p} value={p}>{policyLabel(p)}</option>)}
                </select>
              </div>
            </div>
            <div className="stackbars">
              {GROUPS.map((g) => {
                const b = get(g.id, lossPolicy);
                if (!b) return null;
                const parts = [
                  { key: "caught", v: b.caught, cls: "seg-caught", label: "caught" },
                  { key: "track", v: b.missed_while_tracking, cls: "seg-track", label: "missed while tracking" },
                  { key: "before", v: b.lost_before_discovery, cls: "seg-before", label: "lost before discovery" },
                ];
                return (
                  <div key={g.id} className="stackbar-row">
                    <div className="scale-name">{g.label}</div>
                    <div className="stackbar" role="img"
                      aria-label={`${g.label}: ${parts.map((p) => `${p.label} ${pct(p.v)}`).join(", ")}`}>
                      {parts.map((p) => (
                        <span key={p.key} className={`seg ${p.cls}`} style={{ width: `${p.v * 100}%` }} title={`${p.label}: ${pct(p.v, 1)}`}>
                          {p.v >= 0.07 ? pct(p.v) : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="legend" style={{ marginTop: 8 }}>
              <span className="key"><span className="swatch seg-caught" />Caught</span>
              <span className="key"><span className="swatch seg-track" />Missed while tracking: the radar was known, but the receiver was elsewhere</span>
              <span className="key"><span className="swatch seg-before" />Lost before discovery: no one knew the radar existed yet</span>
            </div>
            <div className="explainer" style={{ marginTop: 12 }}>
              <div>
                <strong>Simulated scenarios</strong>
                <span className="muted">Most of PRIMES&apos; loss is before discovery. For a single narrowband receiver that is largely physics: nothing tells it where an unknown radar is. The oracle avoids it only because it already knows.</span>
              </div>
              <div>
                <strong>Real dataset scenarios</strong>
                <span className="muted">PRIMES finds almost every radar quickly. The loss is while tracking: most real radars are visible irregularly for seconds at a time, which is harder to predict than a clean rotation.</span>
              </div>
              <div>
                <strong>What can recover it</strong>
                <span className="muted">A wideband cue or second receiver attacks the loss before discovery; look-ahead planning attacks the tracking loss on real radars.</span>
              </div>
            </div>
          </div>

          {acc.robustness && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2>When conditions get worse</h2>
                  <p className="sub" style={{ marginBottom: 0 }}>
                    Share of flashes caught as detection gets less reliable, and as false alarms are injected that look like new radars.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="robg">Scenarios</label>
                  <select id="robg" value={robGroup} onChange={(e) => setRobGroup(e.target.value as "all" | "turing")}>
                    <option value="all">All 36 scenarios</option>
                    <option value="turing">Real dataset only (11)</option>
                  </select>
                </div>
              </div>
              <div className="grid-2" style={{ marginTop: 8 }}>
                <PointChart categories={P_D.map((c) => c.label)} series={robSeries(P_D)} xLabel="probability a flash in view is detected" />
                <PointChart categories={P_FA.map((c) => c.label)} series={robSeries(P_FA)} xLabel="false alarms per run" />
              </div>
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
                Missed detections lower the oracle too: at 0.5, half of all flashes cannot be seen by anyone. The fixed sweep is unaffected by false alarms only because it ignores what it hears.
              </p>
            </div>
          )}

          {acc.association && (
            <div className="card">
              <h2>Without being told which pulse belongs to which radar</h2>
              <p className="sub" style={{ marginBottom: 10 }}>
                A real receiver gets unlabelled pulses. &ldquo;Raw pulses&rdquo; mode makes PRIMES sort them itself, by bearing and frequency, before scheduling.
                Comparison on tuning scenarios, separate from the benchmark.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table className="data">
                  <thead>
                    <tr><th>Scenario</th><th>Labelled pulses</th><th>Raw pulses (self-sorted)</th><th>Pulses sorted to the right radar</th><th>Tracks per real radar</th></tr>
                  </thead>
                  <tbody>
                    {acc.association.groups.map((g) => (
                      <tr key={g.group}>
                        <td>{groupLabel(g.group)}</td>
                        <td>{pct(g.labelled, 1)}</td>
                        <td>{pct(g.self_sorted, 1)}</td>
                        <td>{pct(g.purity, 1)}</td>
                        <td>{g.tracks_per_emitter?.toFixed(2) ?? "–"}</td>
                      </tr>
                    ))}
                    <tr className="highlight">
                      <td>Mean</td>
                      <td>{pct(acc.association.mean.labelled, 1)}</td>
                      <td>{pct(acc.association.mean.self_sorted, 1)}</td>
                      <td /><td />
                    </tr>
                  </tbody>
                </table>
              </div>
              <p style={{ margin: "10px 0 0" }}>
                <Link href="/?scenario=turing:192&a=primes&b=primes_pdw&autorun=1" className="btn ghost" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                  Watch labelled vs raw pulses on a real scenario
                </Link>
              </p>
            </div>
          )}

          <p className="muted" style={{ fontSize: 12 }}>
            Benchmark generated {acc.generated}. Full write-up: <code>docs/ACCURACY.md</code>.
          </p>
        </div>
      )}
    </>
  );
}
