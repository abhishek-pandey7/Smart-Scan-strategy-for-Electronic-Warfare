import { Badge, Card, Stat } from "@/components/ui";
import { isReference, policyColor, policyLabel, type RunPayload } from "@/lib/api";
import { RESULT_METRICS, formatMetric, winnerFor } from "./metrics";

export type WinnerBadgesProps = {
  data: RunPayload;
  className?: string;
};

/** One winner badge per headline metric (skips metrics with no values). */
export default function WinnerBadges({ data, className }: WinnerBadgesProps) {
  const cards = RESULT_METRICS.map((metric) => {
    const win = winnerFor(data, metric);
    if (!win) return null;
    const run = data.runs[win.policy];
    const label = policyLabel(win.policy);
    const color = policyColor(win.policy);
    const oracleNote = isReference(win.policy);
    return (
      <Card
        key={metric.id}
        pad="sm"
        accent={color}
        className="winner-badge"
        title={metric.label}
        subtitle={metric.lowerBetter ? "Lower is better" : "Higher is better"}
        actions={
          <Badge tone={oracleNote ? "outline" : "accent"} dot={color} size="md" title={oracleNote ? "Upper-bound reference" : undefined}>
            {label}
          </Badge>
        }
      >
        <Stat
          label="Winner"
          value={formatMetric(metric, run, win.value)}
          color={color}
          size="lg"
          hint={oracleNote ? "Oracle is the clairvoyant upper bound — still shown for comparison." : undefined}
        />
      </Card>
    );
  }).filter(Boolean);

  if (!cards.length) return null;

  return (
    <div className={["grid-4", className].filter(Boolean).join(" ")} aria-label="Who wins what">
      {cards}
    </div>
  );
}
