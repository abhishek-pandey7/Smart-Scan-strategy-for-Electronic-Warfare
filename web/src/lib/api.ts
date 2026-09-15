export type CatalogItem = { id: string; description: string };
export type Catalog = { scenarios: CatalogItem[]; policies: CatalogItem[] };

export type Emitter = {
  id: number; kind: string; label: string; role: string; freqs_mhz: number[];
  period_s: number | null; flash_ms: number | null; appear_s: number;
};

export type Scenario = {
  name: string; horizon_s: number; centres_mhz: number[]; emitters: Emitter[];
  flashes: { columns: string[]; rows: [number, number, number, number, number][]; truncated: boolean };
};

export type Explanation = {
  t: number; centre_mhz: number; dwell_ms: number; mode: "search" | "track"; index: number;
  terms: { exploit: number; discovery: number; info_gain: number }; tracks: number; kappa: number;
  track?: { emitter: number; p: number; model: string; period_s: number | null; confidence: number; next_flash_in_ms: number | null };
};

export type Metrics = Record<string, number | null | string | object>;

export type PolicyRun = {
  policy: string;
  metrics: Metrics;
  looks: { t: number[]; centre: number[]; dwell_ms: number[]; emitters: number[][] };
  intercepts: [number, number, number][];
  timeline: { t: number[]; intercepted: number[]; discovered: number[] };
  tracks: [number, number, number | null, number | null][];
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

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* non-JSON error body */ }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const getCatalog = () => fetch("/api/catalog").then((r) => asJson<Catalog>(r));

export const createRun = (body: { scenario: string; seed: number; policies: string[]; p_d: number }) =>
  fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => asJson<RunPayload>(r));

export const getBenchmark = () => fetch("/api/benchmark").then((r) => asJson<Benchmark>(r));

/** Colour follows the policy, never its position on screen. */
export const POLICY_SLOT: Record<string, number> = {
  primes: 1, raster: 2, dqn: 3, greedy: 4, random: 5, primes_flat: 6, oracle: 7, primes_no_ig: 8,
};
export const policyColor = (p: string) => `var(--series-${POLICY_SLOT[p] ?? 7})`;

export const POLICY_LABEL: Record<string, string> = {
  primes: "PRIMES", raster: "Raster (open-loop)", dqn: "Double-DQN", greedy: "Greedy bandit",
  random: "Random", primes_flat: "PRIMES · flat prior", primes_no_ig: "PRIMES · no info gain", oracle: "Oracle (clairvoyant)",
};
export const policyLabel = (p: string) => POLICY_LABEL[p] ?? p;

export const pct = (x: unknown, digits = 1) => (typeof x === "number" ? `${(x * 100).toFixed(digits)}%` : "–");
export const num = (x: unknown, digits = 1, unit = "") => (typeof x === "number" ? `${x.toFixed(digits)}${unit}` : "–");
