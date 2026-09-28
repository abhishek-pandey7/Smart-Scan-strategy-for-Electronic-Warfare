import { Badge, Card } from "@/components/ui";
import { type Benchmark, isReference, policyColor, policyLabel } from "@/lib/api";
import {
  GROUP_LABEL, METRICS, MAIN_POLICIES, groupEntries, overallWinner, winnerInGroup,
} from "./metrics";

type Props = {
  bench: Benchmark;
  /** When set, winners are for this scenario group; otherwise overall across groups. */
  group?: string | null;
  groups: string[];
};

const CONTENDERS = MAIN_POLICIES.filter((p) => !isReference(p));

export default function WinnerStrip({ bench, group, groups }: Props) {
  const scoped = !!group;
  const entries = group ? groupEntries(bench, group) : [];

  return (
    <Card
      title="Who wins"
      subtitle={
        scoped
          ? `Best mean on ${GROUP_LABEL[group!] ?? group} (main lineup, excluding the Oracle upper bound).`
          : `Most scenario-family wins across ${groups.length} groups (main lineup, excluding the Oracle upper bound).`
      }
      pad="md"
    >
      <div className="grid-4" style={{ gap: 14 }}>
        {METRICS.map((m) => {
          const win = scoped
            ? (() => {
                const w = winnerInGroup(entries, m, CONTENDERS);
                return w ? { policy: w.policy, detail: m.fmt(w.stat.mean) } : null;
              })()
            : (() => {
                const w = overallWinner(bench, m, groups, CONTENDERS);
                return w ? { policy: w.policy, detail: `${w.wins} / ${groups.length} groups` } : null;
              })();

          if (!win) {
            return (
              <div key={m.id} className="stack-sm">
                <div className="small muted">{m.label}</div>
                <span className="muted">–</span>
              </div>
            );
          }

          const smart = win.policy === "primes";
          const ref = isReference(win.policy);
          return (
            <div key={m.id} className="stack-sm">
              <div className="small muted">{m.label}</div>
              <Badge
                tone={smart ? "accent" : ref ? "outline" : "neutral"}
                dot={policyColor(win.policy)}
                size="md"
                title={ref ? "Clairvoyant upper bound — not a fair competitor" : undefined}
              >
                {policyLabel(win.policy)}
              </Badge>
              <div className="num small" style={{ color: smart ? "var(--accent-strong)" : "var(--text-secondary)" }}>
                {win.detail}
                {ref ? " · reference" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
