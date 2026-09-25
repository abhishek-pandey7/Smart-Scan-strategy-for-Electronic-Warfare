"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Legend, SectionHeader } from "@/components/ui";
import {
  IntervalPlot, WinnerStrip, METRICS, GROUP_LABEL, GROUP_ORDER, MAIN_POLICIES,
  isAblation, sortPolicies, type MetricId,
} from "@/components/benchmark";
import { type Benchmark, getBenchmark, policyLabel } from "@/lib/api";

export default function BenchmarkPage() {
  const [bench, setBench] = useState<Benchmark | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metricId, setMetricId] = useState<MetricId>("interception_ratio");
  const [picked, setGroup] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [showAblations, setShowAblations] = useState(false);
  const [winnerScope, setWinnerScope] = useState<"group" | "overall">("group");

  useEffect(() => {
    getBenchmark().then(setBench).catch((e) => setError(String(e)));
  }, []);

  const metric = METRICS.find((m) => m.id === metricId)!;

  const groups = useMemo(() => {
    const g = Array.from(new Set(bench?.summary.map((e) => e.group) ?? []));
    return g.sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a), bi = GROUP_ORDER.indexOf(b);
      if (ai < 0 && bi < 0) return a.localeCompare(b);
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    });
  }, [bench]);

  const group = picked && groups.includes(picked) ? picked : (groups[0] ?? null);

  const policiesInGroup = useMemo(() => {
    if (!bench || !group) return { main: [] as string[], ablations: [] as string[] };
    const present = [...new Set(bench.summary.filter((e) => e.group === group).map((e) => e.policy))];
    const main = MAIN_POLICIES.filter((p) => present.includes(p));
    const ablations = sortPolicies(present.filter(isAblation), false);
    return { main, ablations };
  }, [bench, group]);

  return (
    <div className="stack-lg">
      <SectionHeader
        as="h1"
        eyebrow="Evidence"
        title="Benchmark"
        lede="Every scheduler replayed on identical truth across scenario families. Dots are means; lines are 95% bootstrap confidence intervals."
      />

      {error && <p className="notice error">{error}</p>}

      {bench && group && (
        <>
          <div className="meta-row">
            <div className="segmented" role="group" aria-label="Winner scope">
              <button type="button" aria-pressed={winnerScope === "group"} onClick={() => setWinnerScope("group")}>
                This scenario
              </button>
              <button type="button" aria-pressed={winnerScope === "overall"} onClick={() => setWinnerScope("overall")}>
                Overall
              </button>
            </div>
            <span className="muted small">
              {bench.config.seeds} seeds per simulated family · {bench.config.turing.length} Turing scenarios · generated {bench.generated}
            </span>
          </div>

          <WinnerStrip
            bench={bench}
            group={winnerScope === "group" ? group : null}
            groups={groups}
          />

          <Card
            title="Compare"
            subtitle={metric.higher ? "Higher is better" : "Lower is better"}
            actions={
              <button type="button" className="btn ghost" onClick={() => setShowTable(!showTable)}>
                {showTable ? "Show charts" : "Show table"}
              </button>
            }
          >
            <div className="controls" style={{ marginBottom: 16 }}>
              <div className="field">
                <label htmlFor="metric">Metric</label>
                <select id="metric" value={metricId} onChange={(e) => setMetricId(e.target.value as MetricId)}>
                  {METRICS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 0 }}>
                <label id="scenario-tabs-label">Scenario</label>
                <div className="segmented" role="tablist" aria-labelledby="scenario-tabs-label" style={{ flexWrap: "wrap" }}>
                  {groups.map((g) => (
                    <button
                      key={g}
                      type="button"
                      role="tab"
                      aria-selected={group === g}
                      onClick={() => setGroup(g)}
                    >
                      {GROUP_LABEL[g] ?? g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!showTable ? (
              <div className="stack">
                <Legend policies={policiesInGroup.main} shape="line" />
                <IntervalPlot
                  bench={bench}
                  group={group}
                  metric={metric}
                  policies={policiesInGroup.main}
                />

                {policiesInGroup.ablations.length > 0 && (
                  <details
                    className="disclosure"
                    open={showAblations}
                    onToggle={(e) => setShowAblations((e.target as HTMLDetailsElement).open)}
                  >
                    <summary>
                      Ablations
                      <Badge tone="outline">{policiesInGroup.ablations.length}</Badge>
                      <span className="muted">
                        Smart Scan variants that turn individual components off
                      </span>
                    </summary>
                    <div className="stack" style={{ marginTop: 14 }}>
                      <Legend policies={policiesInGroup.ablations} shape="line" />
                      <IntervalPlot
                        bench={bench}
                        group={group}
                        metric={metric}
                        policies={policiesInGroup.ablations}
                      />
                    </div>
                  </details>
                )}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th style={{ textAlign: "left" }}>Scheduler</th>
                      {METRICS.map((m) => <th key={m.id}>{m.label}</th>)}
                      <th>Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.flatMap((g) => {
                      const present = [...new Set(bench.summary.filter((e) => e.group === g).map((e) => e.policy))];
                      const ordered = [
                        ...MAIN_POLICIES.filter((p) => present.includes(p)),
                        ...sortPolicies(present.filter(isAblation), false),
                      ];
                      return ordered.map((policy) => {
                        const e = bench.summary.find((row) => row.group === g && row.policy === policy);
                        if (!e) return null;
                        const ablation = isAblation(policy);
                        return (
                          <tr
                            key={`${g}-${policy}`}
                            className={policy === "primes" ? "highlight" : undefined}
                            style={ablation ? { color: "var(--text-secondary)" } : undefined}
                          >
                            <td>{GROUP_LABEL[g] ?? g}</td>
                            <td style={{ textAlign: "left" }}>
                              {policyLabel(policy)}
                              {ablation && (
                                <span className="muted small" style={{ marginLeft: 8 }}>ablation</span>
                              )}
                            </td>
                            {METRICS.map((m) => {
                              const s = e[m.id];
                              const stat = s && typeof s === "object" && "mean" in s ? s : null;
                              return (
                                <td key={m.id}>
                                  {stat
                                    ? `${m.fmt(stat.mean)} [${m.fmt(stat.ci95[0])}, ${m.fmt(stat.ci95[1])}]`
                                    : "–"}
                                </td>
                              );
                            })}
                            <td>{e.n}</td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {!bench && !error && <p className="notice">Loading benchmark…</p>}
    </div>
  );
}
