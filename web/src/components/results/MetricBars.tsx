import { Card } from "@/components/ui";
import { isReference, policyColor, policyLabel, type RunPayload } from "@/lib/api";
import { RESULT_METRICS, barWidthPct, formatMetric, metricEntries } from "./metrics";

export type MetricBarsProps = {
  data: RunPayload;
  className?: string;
};

/** Grouped horizontal bars: one group per metric, one bar per policy. */
export default function MetricBars({ data, className }: MetricBarsProps) {
  const groups = RESULT_METRICS.map((metric) => {
    const entries = metricEntries(data, metric);
    if (!entries.length) return null;
    const values = entries.map((e) => e.value);
    return (
      <Card key={metric.id} pad="sm" title={metric.label} subtitle={metric.lowerBetter ? "Longer bar = faster first catch" : "Longer is better"}>
        <div className="stack-sm" role="list" aria-label={metric.label}>
          {entries.map(({ policy, value, run }) => (
            <div
              key={policy}
              role="listitem"
              className="hstack"
              style={{ display: "grid", gridTemplateColumns: "140px 1fr 72px", gap: 10, alignItems: "center" }}
            >
              <span className="key" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span className="swatch" style={{ background: policyColor(policy) }} />
                {policyLabel(policy)}
                {isReference(policy) && <span className="muted small"> · ref</span>}
              </span>
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={{
                    width: `${barWidthPct(metric, value, values)}%`,
                    background: policyColor(policy),
                    ...(isReference(policy) ? { opacity: 0.55 } : null),
                  }}
                />
              </span>
              <span className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                {formatMetric(metric, run, value)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    );
  }).filter(Boolean);

  if (!groups.length) return null;

  return (
    <div className={["grid-2", className].filter(Boolean).join(" ")} aria-label="Metric comparison">
      {groups}
    </div>
  );
}
