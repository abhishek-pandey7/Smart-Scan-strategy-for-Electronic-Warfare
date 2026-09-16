"use client";

import type { Emitter, PolicyRun } from "@/lib/api";

function atOrBefore<T extends { t: number }>(items: T[], t: number): T | undefined {
  let lo = 0, hi = items.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? items[ans] : undefined;
}

export function DecisionPanel({ run, cursor }: { run: PolicyRun; cursor: number }) {
  const ex = atOrBefore(run.explanations, cursor);
  if (!ex) return <p className="muted">No decision yet.</p>;
  const terms = [
    { label: "Exploit", value: ex.terms.exploit, hint: "expected intercepts of known emitters" },
    { label: "Discovery", value: ex.terms.discovery, hint: "expected new emitters found" },
    { label: "Info gain", value: ex.terms.info_gain, hint: "λ × bits learned about timing" },
  ];
  const max = Math.max(...terms.map((x) => x.value), 1e-9);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="badge">{ex.mode === "track" ? "Tracking" : "Searching"}</span>
        <span>t = {ex.t.toFixed(2)} s</span>
        <span className="muted">·</span>
        <strong>{(ex.centre_mhz / 1000).toFixed(2)} GHz</strong>
        <span className="muted">for</span>
        <strong>{ex.dwell_ms} ms</strong>
      </div>
      {ex.track && (
        <p style={{ margin: 0 }}>
          Emitter <strong>{ex.track.emitter}</strong> ({ex.track.model}
          {ex.track.period_s ? `, period ≈ ${ex.track.period_s.toFixed(3)} s` : ""}) predicted
          {ex.track.next_flash_in_ms !== null ? ` in ${ex.track.next_flash_in_ms.toFixed(0)} ms` : " visible"} with
          P = {ex.track.p.toFixed(2)}.
        </p>
      )}
      <div className="stack" style={{ gap: 6 }}>
        {terms.map((x) => (
          <div key={x.label} className="term" title={x.hint}>
            <span className="muted">{x.label}</span>
            <span style={{ background: "var(--surface-2)", borderRadius: 4 }}>
              <span className="bar" style={{ display: "block", width: `${(100 * x.value) / max}%`, minWidth: x.value > 0 ? 2 : 0 }} />
            </span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{x.value.toFixed(3)}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Score = (exploit + discovery + info gain) ÷ dwell time · {ex.tracks} emitter tracks · learned visibility κ = {ex.kappa}
      </p>
    </div>
  );
}

export function TrackTable({ run, emitters, cursor }: { run: PolicyRun; emitters: Emitter[]; cursor: number }) {
  const truth = new Map(emitters.map((e) => [e.id, e]));
  const latest = new Map<number, { t: number; period: number | null; conf: number | null; hits: number }>();
  for (const [t, e, period, conf] of run.tracks) {
    if (t > cursor) break;
    const prev = latest.get(e);
    latest.set(e, { t, period, conf, hits: (prev?.hits ?? 0) + 1 });
  }
  const rows = [...latest.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 10);
  const LEVELS = ["low", "medium", "high"];
  const threatOf = new Map<number, string>();
  for (const [t, e, probs] of run.threats ?? []) {
    if (t > cursor) break;
    threatOf.set(e, LEVELS[probs.indexOf(Math.max(...probs))]);
  }
  const showThreat = threatOf.size > 0;
  if (!rows.length) return <p className="muted">No emitters tracked yet.</p>;
  return (
    <table className="data">
      <thead>
        <tr><th>Emitter</th><th>Flashes caught</th><th>Estimated period</th><th>True period</th><th>Confidence</th>{showThreat && <th>Threat (predicted / true)</th>}</tr>
      </thead>
      <tbody>
        {rows.map(([e, r]) => {
          const tp = truth.get(e)?.period_s ?? null;
          const est = r.period !== null && r.period > 0 ? r.period : null;
          const ok = est !== null && tp !== null && Math.abs(est / tp - 1) < 0.01;
          return (
            <tr key={e}>
              <td title={truth.get(e)?.label}>{e} <span className="muted">{truth.get(e)?.label?.slice(0, 28)}</span></td>
              <td>{r.hits}</td>
              <td>{r.hits < 2 ? <span className="muted">learning (1 flash)</span> : est !== null ? `${est.toFixed(3)} s` : "intermittent"}{ok && r.hits >= 2 ? " ✓" : ""}</td>
              <td>{tp !== null ? `${tp.toFixed(3)} s` : "–"}</td>
              <td>{r.conf !== null ? r.conf.toFixed(2) : "–"}</td>
              {showThreat && (
                <td>
                  <span className={`threat threat-${threatOf.get(e) ?? "none"}`}>{threatOf.get(e) ?? "–"}</span>
                  <span className="muted"> / {truth.get(e)?.threat || "–"}</span>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
