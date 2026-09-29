export type CatalogItem = { id: string; description: string };
export type Catalog = { scenarios: CatalogItem[]; policies: CatalogItem[] };

export type Emitter = {
  id: number; kind: string; label: string; role: string; freqs_mhz: number[];
  period_s: number | null; flash_ms: number | null; appear_s: number; threat?: string;
};

export type Scenario = {
  name: string; horizon_s: number; centres_mhz: number[]; emitters: Emitter[];
  flashes: { columns: string[]; rows: [number, number, number, number, number][]; truncated: boolean };
};

export type Explanation = {
  t: number; centre_mhz: number; dwell_ms: number; mode: "search" | "track" | "extend"; index: number;
  terms: { exploit: number; discovery: number; info_gain: number }; tracks: number; kappa: number;
  track?: { emitter: number; p: number; model: string; period_s: number | null; confidence: number; next_flash_in_ms: number | null };
};

export type Metrics = Record<string, number | null | string | object>;

export type Timeline = { t: number[]; intercepted: number[]; discovered: number[] };

export type PolicyRun = {
  policy: string;
  metrics: Metrics;
  looks: { t: number[]; centre: number[]; dwell_ms: number[]; emitters: number[][] };
  intercepts: [number, number, number][];
  timeline: Timeline;
  tracks: [number, number, number | null, number | null][];
  threats?: [number, number, number[]][];
  /** Self-sorted runs only: scheduler track id -> [true emitter owning most of its pulses, share of its pulses]. */
  owners?: Record<string, [number, number]>;
  predictions: { t: number; emitter: number; predicted: number; actual: number | null }[];
  explanations: Explanation[];
};

export type RunPayload = {
  id: string;
  request: { scenario: string; seed: number; policies: string[]; p_d: number; p_fa: number };
  scenario: Scenario;
  runs: Record<string, PolicyRun>;
};

export type Stat = { mean: number; ci95: [number, number]; n: number };
export type BenchmarkEntry = { group: string; policy: string; n: number } & Partial<Record<string, Stat>>;
export type Benchmark = {
  generated: string;
  config: { seeds: number; families: string[]; turing: number[]; policies: string[] };
  summary: BenchmarkEntry[];
};

export type ModelInfo = { id: string; name: string; kind: string; description: string };
export type DqnCurve = { timesteps: number[]; mean_reward: number[] };
export type ModelsPayload = { models: ModelInfo[]; dqn_curve: DqnCurve | null };

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* non-JSON error body */ }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export type LossBreakdown = {
  group: string; policy: string; n: number; caught: number; lost_before_discovery: number;
  missed_while_tracking: number; tracked_ratio: number | null; discovery_fraction: number;
};
export type RobustnessEntry = {
  condition: string; group: "all" | "turing"; policy: string; n: number;
  interception_ratio: Stat; false_alarms: Stat | null;
};
export type AssociationGroup = {
  group: string; n: number; labelled: number; self_sorted: number; purity: number | null;
  tracks_per_emitter: number | null; contaminated_tracks: number | null;
};
export type Accuracy = {
  generated: string;
  breakdown: LossBreakdown[];
  robustness: { conditions: { id: string; p_d: number; p_fa: number }[]; summary: RobustnessEntry[] } | null;
  association: { note: string; groups: AssociationGroup[]; mean: { labelled: number; self_sorted: number } } | null;
};

/** Static builds (NEXT_PUBLIC_STATIC=1) read baked JSON instead of calling the Python API. */
const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
const endpoint = (name: string) => (STATIC ? `/api/${name}.json` : `/api/${name}`);

/** Must match slug() in scripts/export_static.py. */
const runSlug = (scenario: string, policies: string[]) =>
  `${scenario.replace(/[^A-Za-z0-9]+/g, "-")}__${[...policies].sort().join("-")}`;

let catalogPromise: Promise<Catalog> | null = null;
export const getCatalog = () => {
  catalogPromise ??= fetch(endpoint("catalog")).then((r) => asJson<Catalog>(r)).catch((e) => { catalogPromise = null; throw e; });
  return catalogPromise;
};

/** The main lineup, always run together. Oracle is the dashed upper-bound reference. */
export const LINEUP = ["primes", "dqn", "greedy", "raster", "random", "oracle"] as const;
export type LineupId = (typeof LINEUP)[number];

/** LINEUP restricted to what the backend can run (Double-DQN is absent until its model is trained). */
export const availableLineup = (catalog: Catalog | null | undefined): string[] => {
  if (!catalog) return [...LINEUP];
  const ids = new Set(catalog.policies.map((p) => p.id));
  return LINEUP.filter((p) => ids.has(p));
};

export type RunRequest = { scenario: string; policies?: string[]; seed?: number; p_d?: number };

export const createRun = async ({ scenario, policies, seed = 0, p_d = 1 }: RunRequest) => {
  const list = policies ?? availableLineup(await getCatalog().catch(() => null));
  if (STATIC) {
    // Static hosting cannot serve POST; every offered run is baked at build time.
    return asJson<RunPayload>(await fetch(`/api/runs/${runSlug(scenario, list)}.json`));
  }
  const res = await fetch("/api/runs", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, seed, policies: list, p_d }),
  });
  return asJson<RunPayload>(res);
};

export const getBenchmark = () => fetch(endpoint("benchmark")).then((r) => asJson<Benchmark>(r));
export const getAccuracy = () => fetch(endpoint("accuracy")).then((r) => asJson<Accuracy>(r));
export const getModels = () => fetch(endpoint("models")).then((r) => asJson<ModelsPayload>(r));

/** Ekalavya variants share the explanation and learned-track panels. */
export const isPrimes = (p: string) => p.startsWith("primes");

export type PolicyFamily = "classical" | "learned" | "rl" | "reference";
export const FAMILY_LABEL: Record<PolicyFamily, string> = {
  classical: "Classical", learned: "Learned model", rl: "Reinforcement learning", reference: "Reference",
};

export const POLICY_LABEL: Record<string, string> = {
  primes: "Ekalavya",
  dqn: "Double-DQN",
  greedy: "Greedy bandit",
  raster: "Raster sweep",
  random: "Random",
  oracle: "Oracle",
  primes_flat: "Ekalavya · flat prior",
  primes_no_ig: "Ekalavya · no info gain",
  primes_fprior: "Ekalavya · frequency prior",
  primes_no_micro: "Ekalavya · no micro dwells",
  primes_threat: "Ekalavya · threat weighted",
  primes_exist: "Ekalavya · existence weighted",
};
export const policyLabel = (p: string) => POLICY_LABEL[p] ?? (p.startsWith("primes") ? "Ekalavya variant" : p);

export const POLICY_FAMILY: Record<string, PolicyFamily> = {
  primes: "learned", dqn: "rl", greedy: "classical", raster: "classical", random: "classical", oracle: "reference",
  primes_flat: "learned", primes_no_ig: "learned", primes_fprior: "learned",
  primes_no_micro: "learned", primes_threat: "learned", primes_exist: "learned",
};
export const policyFamily = (p: string): PolicyFamily => POLICY_FAMILY[p] ?? "classical";

export const POLICY_BLURB: Record<string, string> = {
  primes: "Learns each radar's rhythm, predicts its next flash, and spends listening time where it pays off most.",
  dqn: "A deep reinforcement learning agent that learns where to listen purely by trial and error.",
  greedy: "Keeps going back to the frequencies that paid off before. Simple, but it stops exploring.",
  raster: "The traditional fixed sweep across the band. Predictable, so radars in step with it are never seen.",
  random: "Picks a random slice of spectrum every look. The floor any scheduler has to beat.",
  oracle: "Cheats: it sees the true radar schedule. Shows the best score that is physically possible.",
  primes_flat: "Ekalavya without the priors learned from real data: it starts with no idea of typical periods.",
  primes_no_ig: "Ekalavya without the information-gain term: it never looks just to learn timing.",
  primes_fprior: "Ekalavya with search seeded by the learned frequency distribution.",
  primes_no_micro: "Ekalavya without very short search looks.",
  primes_threat: "Ekalavya that weights radars by their predicted threat level.",
  primes_exist: "Ekalavya that down-weights tracks likely to be false alarms.",
};
export const policyBlurb = (p: string) => POLICY_BLURB[p] ?? "";

const COLORED = new Set(Object.keys(POLICY_LABEL));
/** CSS custom property name for a policy's fixed colour, e.g. "--series-primes". For canvas code. */
export const policyColorVar = (p: string) => `--series-${COLORED.has(p) ? p : "other"}`;
/** Colour follows the policy, never its position on screen. */
export const policyColor = (p: string) => `var(${policyColorVar(p)})`;
/** SVG stroke-dasharray for a policy's line; only the reference is dashed. */
export const policyDash = (p: string) => (p === "oracle" ? "6 4" : undefined);
export const isReference = (p: string) => policyFamily(p) === "reference";

/** @deprecated use policyColorVar. Kept so --series-N aliases in globals.css keep working. */
export const POLICY_SLOT: Record<string, number> = {
  primes: 1, raster: 2, dqn: 3, greedy: 4, random: 5, primes_flat: 6, oracle: 7, primes_no_ig: 8,
  primes_pdw: 3, primes_threat: 5, primes_exist: 8, primes_fprior: 6, primes_no_micro: 8,
};

/** Index of the last element <= t in a sorted array, or -1 if none. */
export function indexAtOrBefore(sorted: number[], t: number) {
  let lo = 0, hi = sorted.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export type TimelinePoint = { i: number; t: number; intercepted: number; discovered: number };

/** Cumulative counts at the playback cursor (clamped to the first sample before t = 0). */
export function atCursor(timeline: Timeline, cursor: number): TimelinePoint {
  const i = Math.max(0, indexAtOrBefore(timeline.t, cursor));
  return { i, t: timeline.t[i] ?? 0, intercepted: timeline.intercepted[i] ?? 0, discovered: timeline.discovered[i] ?? 0 };
}

/** Last item with item.t <= cursor, e.g. the current explanation. */
export function itemAtCursor<T extends { t: number }>(items: T[], cursor: number): T | undefined {
  let lo = 0, hi = items.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].t <= cursor) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? items[ans] : undefined;
}

export const pct = (x: unknown, digits = 1) => (typeof x === "number" ? `${(x * 100).toFixed(digits)}%` : "–");
export const num = (x: unknown, digits = 1, unit = "") => (typeof x === "number" ? `${x.toFixed(digits)}${unit}` : "–");
