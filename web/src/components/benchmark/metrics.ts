import { LINEUP, type Benchmark, type BenchmarkEntry, type Stat } from "@/lib/api";

export const METRICS = [
  { id: "interception_ratio", label: "Flashes intercepted", max: 1, fmt: (v: number) => `${(v * 100).toFixed(1)}%`, higher: true },
  { id: "discovery_fraction", label: "Emitters discovered", max: 1, fmt: (v: number) => `${(v * 100).toFixed(0)}%`, higher: true },
  { id: "ttfi_mean_s", label: "Mean time to first intercept", max: null, fmt: (v: number) => `${v.toFixed(1)} s`, higher: false },
  { id: "prediction_correct_pct", label: "Next-flash predictions correct", max: 100, fmt: (v: number) => `${v.toFixed(0)}%`, higher: true },
] as const;

export type MetricId = (typeof METRICS)[number]["id"];
export type MetricDef = (typeof METRICS)[number];

export const GROUP_LABEL: Record<string, string> = {
  easy: "Easy",
  lockout: "Lock-out",
  popup: "Pop-up",
  dense: "Dense (40 emitters)",
  mixed: "Mixed periodic + intermittent",
  turing: "Turing dataset (real scenarios)",
};

export const GROUP_ORDER = Object.keys(GROUP_LABEL);

/** Main lineup shown first on the benchmark page (Oracle last as reference). */
export const MAIN_POLICIES = [...LINEUP];

const ABLATION_ORDER = [
  "primes_flat", "primes_no_ig", "primes_fprior", "primes_no_micro", "primes_threat", "primes_exist",
];

export const isAblation = (p: string) => p.startsWith("primes_") && p !== "primes";

export function sortPolicies(policies: string[], preferMain = true) {
  return [...policies].sort((a, b) => {
    if (preferMain) {
      const ai = MAIN_POLICIES.indexOf(a as (typeof MAIN_POLICIES)[number]);
      const bi = MAIN_POLICIES.indexOf(b as (typeof MAIN_POLICIES)[number]);
      if (ai >= 0 || bi >= 0) {
        if (ai < 0) return 1;
        if (bi < 0) return -1;
        return ai - bi;
      }
    }
    const aa = ABLATION_ORDER.indexOf(a);
    const ba = ABLATION_ORDER.indexOf(b);
    if (aa >= 0 || ba >= 0) {
      if (aa < 0) return 1;
      if (ba < 0) return -1;
      return aa - ba;
    }
    return a.localeCompare(b);
  });
}

export function groupEntries(bench: Benchmark, group: string): BenchmarkEntry[] {
  return bench.summary.filter((e) => e.group === group);
}

export function metricStat(entry: BenchmarkEntry, id: MetricId): Stat | undefined {
  const s = entry[id];
  return s && typeof s === "object" && "mean" in s ? (s as Stat) : undefined;
}

/** Best policy in a group for a metric (main lineup only by default). */
export function winnerInGroup(
  entries: BenchmarkEntry[],
  metric: MetricDef,
  policies: readonly string[] = MAIN_POLICIES,
): { policy: string; stat: Stat } | null {
  const pool = entries.filter((e) => policies.includes(e.policy) && metricStat(e, metric.id));
  if (!pool.length) return null;
  const ranked = [...pool].sort((a, b) => {
    const am = metricStat(a, metric.id)!.mean;
    const bm = metricStat(b, metric.id)!.mean;
    return metric.higher ? bm - am : am - bm;
  });
  const top = ranked[0];
  return { policy: top.policy, stat: metricStat(top, metric.id)! };
}

/** Policy that wins the most scenario groups for a metric (ties broken by MAIN order). */
export function overallWinner(
  bench: Benchmark,
  metric: MetricDef,
  groups: string[],
  policies: readonly string[] = MAIN_POLICIES,
): { policy: string; wins: number } | null {
  const counts = new Map<string, number>();
  for (const g of groups) {
    const w = winnerInGroup(groupEntries(bench, g), metric, policies);
    if (w) counts.set(w.policy, (counts.get(w.policy) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return policies.indexOf(a[0]) - policies.indexOf(b[0]);
  });
  return { policy: ranked[0][0], wins: ranked[0][1] };
}
