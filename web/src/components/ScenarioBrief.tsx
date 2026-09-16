"use client";

import type { Scenario } from "@/lib/api";
import { briefing } from "@/lib/scenarios";

function summarise(s: Scenario) {
  const em = s.emitters;
  const rotating = em.filter((e) => e.kind === "circular");
  const intermittent = em.filter((e) => e.kind === "markov");
  const omni = em.filter((e) => e.kind === "omni");
  const periods = rotating.map((e) => e.period_s).filter((p): p is number => p !== null);
  const freqs = em.flatMap((e) => e.freqs_mhz);
  const roles = em.reduce<Record<string, number>>((acc, e) => {
    if (e.role) acc[e.role] = (acc[e.role] ?? 0) + 1;
    return acc;
  }, {});
  const types = em.reduce<Record<string, number>>((acc, e) => {
    if (e.label && !/^(scanner|population|omni|intermittent|pop-up|lockout|regular)/i.test(e.label)) {
      acc[e.label] = (acc[e.label] ?? 0) + 1;
    }
    return acc;
  }, {});
  return { em, rotating, intermittent, omni, periods, freqs, roles, types };
}

export default function ScenarioBrief({ id, scenario }: { id: string; scenario?: Scenario }) {
  const b = briefing(id);
  const s = scenario ? summarise(scenario) : null;
  const facts: string[] = [];
  if (s) {
    facts.push(`${s.em.length} emitters`);
    if (s.rotating.length) facts.push(`${s.rotating.length} rotating`);
    if (s.intermittent.length) facts.push(`${s.intermittent.length} intermittent`);
    if (s.omni.length) facts.push(`${s.omni.length} always-on`);
    if (s.periods.length) {
      const lo = Math.min(...s.periods), hi = Math.max(...s.periods);
      facts.push(lo === hi ? `rotation every ${lo.toFixed(2)} s` : `rotation every ${lo.toFixed(1)}–${hi.toFixed(1)} s`);
    }
    if (s.freqs.length) facts.push(`${(Math.min(...s.freqs) / 1000).toFixed(1)}–${(Math.max(...s.freqs) / 1000).toFixed(1)} GHz`);
    if (s.roles["lockout-exact"]) facts.push(`${s.roles["lockout-exact"]} exactly in step with the sweep`);
    if (s.roles["lockout-near"]) facts.push(`${s.roles["lockout-near"]} nearly in step`);
    if (s.roles["popup"]) facts.push(`${s.roles["popup"]} switch on mid-mission`);
  }
  const topTypes = s ? Object.entries(s.types).sort((x, y) => y[1] - x[1]).slice(0, 6) : [];

  return (
    <div className="card brief">
      <h2>{b.title}</h2>
      <div className="brief-grid">
        <div><strong>What&apos;s in it</strong><span>{b.what}</span></div>
        <div><strong>What it tests</strong><span>{b.tests}</span></div>
        <div><strong>What to watch for</strong><span>{b.watch}</span></div>
        <div><strong>The fixed sweep here</strong><span>{b.why}</span></div>
      </div>
      {facts.length > 0 && (
        <div className="brief-facts">
          {facts.map((f) => <span key={f} className="badge">{f}</span>)}
        </div>
      )}
      {topTypes.length > 0 && (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
          Radar types include: {topTypes.map(([name, n]) => (n > 1 ? `${name} (×${n})` : name)).join(", ")}
        </p>
      )}
    </div>
  );
}
