import { Badge, Card } from "@/components/ui";
import { isReference, policyColor, policyLabel, type RunPayload } from "@/lib/api";
import {
  RESULT_METRICS,
  formatMetric,
  orderedPolicies,
  type MetricDef,
} from "./metrics";

export type ScorecardProps = {
  data: RunPayload;
  className?: string;
};

function rankKey(data: RunPayload, policy: string): [number, number, number] {
  const m = data.runs[policy].metrics;
  const ir = typeof m.interception_ratio === "number" ? m.interception_ratio : -1;
  const disc =
    typeof m.discovery_fraction === "number"
      ? m.discovery_fraction
      : typeof m.emitters_discovered === "number"
        ? m.emitters_discovered
        : -1;
  const ttfi = typeof m.ttfi_mean_s === "number" ? m.ttfi_mean_s : Number.POSITIVE_INFINITY;
  return [ir, disc, -ttfi]; // higher sort key = better
}

function cell(metric: MetricDef, data: RunPayload, policy: string): string {
  const run = data.runs[policy];
  const v = metric.get(run.metrics);
  if (v == null) return "–";
  return formatMetric(metric, run, v);
}

function isBest(metric: MetricDef, data: RunPayload, policy: string): boolean {
  const run = data.runs[policy];
  const v = metric.get(run.metrics);
  if (v == null) return false;
  const others = orderedPolicies(data)
    .map((p) => metric.get(data.runs[p].metrics))
    .filter((x): x is number => x != null);
  if (!others.length) return false;
  return metric.lowerBetter ? v === Math.min(...others) : v === Math.max(...others);
}

/** Ranked scorecard of every policy on the headline metrics. */
export default function Scorecard({ data, className }: ScorecardProps) {
  const policies = orderedPolicies(data);
  if (!policies.length) return null;

  const ranked = [...policies].sort((a, b) => {
    const [ai, ad, at] = rankKey(data, a);
    const [bi, bd, bt] = rankKey(data, b);
    return bi - ai || bd - ad || bt - at || a.localeCompare(b);
  });

  return (
    <Card
      className={className}
      title="Scorecard"
      subtitle="Ranked by flash interception, then discovery, then time to first catch."
    >
      <div style={{ overflowX: "auto" }}>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Receiver</th>
              {RESULT_METRICS.map((m) => (
                <th key={m.id} scope="col" title={m.lowerBetter ? "Lower is better" : "Higher is better"}>
                  {m.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map((policy, i) => {
              const ref = isReference(policy);
              return (
                <tr key={policy} className={policy === "primes" ? "highlight" : undefined}>
                  <td className="mono muted">{i + 1}</td>
                  <td>
                    <span className="key">
                      <span className="swatch" style={{ background: policyColor(policy) }} />
                      {policyLabel(policy)}
                    </span>
                    {ref && (
                      <>
                        {" "}
                        <Badge tone="outline" size="sm">
                          upper bound
                        </Badge>
                      </>
                    )}
                  </td>
                  {RESULT_METRICS.map((m) => (
                    <td
                      key={m.id}
                      className="mono"
                      style={isBest(m, data, policy) ? { fontWeight: 700, color: policyColor(policy) } : undefined}
                    >
                      {cell(m, data, policy)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
