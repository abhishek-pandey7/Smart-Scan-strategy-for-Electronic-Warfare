import {
  LINEUP,
  isReference,
  num,
  pct,
  type Metrics,
  type PolicyRun,
  type RunPayload,
} from "@/lib/api";

export type MetricId =
  | "interception_ratio"
  | "discovery"
  | "ttfi_mean_s"
  | "prediction_correct_pct";

export type MetricDef = {
  id: MetricId;
  /** Full label for cards / table headers. */
  label: string;
  /** Shorter label for compact UI. */
  short: string;
  /** When true, the lowest numeric value wins. */
  lowerBetter: boolean;
  get: (m: Metrics) => number | null;
  format: (v: number) => string;
};

const asNum = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Prefer discovery_fraction (0–1); fall back to emitters_discovered count. */
export function discoveryValue(m: Metrics): number | null {
  const frac = asNum(m.discovery_fraction);
  if (frac != null) return frac;
  return asNum(m.emitters_discovered);
}

export function discoveryFormat(m: Metrics, v: number): string {
  if (asNum(m.discovery_fraction) != null) return pct(v);
  return num(v, 0);
}

export const RESULT_METRICS: MetricDef[] = [
  {
    id: "interception_ratio",
    label: "Flash interception",
    short: "Interception",
    lowerBetter: false,
    get: (m) => asNum(m.interception_ratio),
    format: (v) => pct(v),
  },
  {
    id: "discovery",
    label: "Discovery",
    short: "Discovery",
    lowerBetter: false,
    get: discoveryValue,
    format: (v) => pct(v), // overridden per-row when falling back to counts
  },
  {
    id: "ttfi_mean_s",
    label: "Time to first catch",
    short: "TTFI",
    lowerBetter: true,
    get: (m) => asNum(m.ttfi_mean_s),
    format: (v) => num(v, 1, " s"),
  },
  {
    id: "prediction_correct_pct",
    label: "Prediction accuracy",
    short: "Predictions",
    lowerBetter: false,
    get: (m) => asNum(m.prediction_correct_pct),
    format: (v) => `${v.toFixed(1)}%`,
  },
];

/** Policies present in the run, ordered by LINEUP then any extras. */
export function orderedPolicies(data: RunPayload): string[] {
  const present = new Set(Object.keys(data.runs));
  const primary = LINEUP.filter((p) => present.has(p));
  const extras = [...present].filter((p) => !LINEUP.includes(p as (typeof LINEUP)[number])).sort();
  return [...primary, ...extras];
}

export function metricEntries(data: RunPayload, metric: MetricDef): { policy: string; value: number; run: PolicyRun }[] {
  return orderedPolicies(data)
    .map((policy) => {
      const run = data.runs[policy];
      const value = metric.get(run.metrics);
      return value == null ? null : { policy, value, run };
    })
    .filter((x): x is { policy: string; value: number; run: PolicyRun } => x != null);
}

/** Pick the winning policy for a metric; null if no comparable values. */
export function winnerFor(data: RunPayload, metric: MetricDef): { policy: string; value: number } | null {
  const entries = metricEntries(data, metric).filter((e) => !isReference(e.policy));
  if (!entries.length) return null;
  let best = entries[0];
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i];
    const better = metric.lowerBetter ? e.value < best.value : e.value > best.value;
    if (better) best = e;
  }
  return { policy: best.policy, value: best.value };
}

export function formatMetric(metric: MetricDef, run: PolicyRun, value: number): string {
  if (metric.id === "discovery") return discoveryFormat(run.metrics, value);
  return metric.format(value);
}

export function barWidthPct(metric: MetricDef, value: number, values: number[]): number {
  if (!values.length) return 0;
  if (metric.lowerBetter) {
    const finite = values.filter((v) => Number.isFinite(v) && v > 0);
    const best = finite.length ? Math.min(...finite) : 0;
    if (best <= 0 || !Number.isFinite(value) || value <= 0) return 0;
    // Invert: shorter TTFI → longer bar (best = 100%).
    return Math.min(100, (100 * best) / value);
  }
  const max = Math.max(...values, 0);
  if (max <= 0) return 0;
  return Math.min(100, (100 * value) / max);
}

export { isReference };
