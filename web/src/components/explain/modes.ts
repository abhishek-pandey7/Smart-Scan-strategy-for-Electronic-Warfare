import type { Explanation } from "@/lib/api";

export type Mode = Explanation["mode"];

export const MODES: readonly Mode[] = ["search", "track", "extend"];
export const MODE_LABEL: Record<Mode, string> = { search: "Search", track: "Track", extend: "Extend" };
export const MODE_VERB: Record<Mode, string> = { search: "Searching", track: "Tracking", extend: "Extending" };
export const modeColor = (m: Mode) => `var(--mode-${m})`;

/** Must match the scheduler's constants (search threshold, dither, micro dwell controller). */
export const SEARCH_THRESHOLD = 0.15;
export const DITHER_PCT = 5;
export const EXTEND_MS = 5;
export const MAX_EXTENSIONS = 3;
export const LAMBDA = 0.3;
export const W_NEW = 2;

export const MODE_RULE: Record<Mode, string> = {
  search: `No known emitter has at least a ${SEARCH_THRESHOLD} chance of being caught by any look, so the best look is the one most likely to find a new emitter. A small (±${DITHER_PCT} %) golden-ratio dither breaks near-ties so the look pattern cannot fall into step with a radar.`,
  track: `The best known emitter has at least a ${SEARCH_THRESHOLD} chance of being caught, weighted by how long since it was last heard. The score is dominated by its predicted flash, so the look lands on its frequency just before the flash is due.`,
  extend: `The last look heard 1–2 pulses in its final 3 ms but could not confirm an emitter. Instead of hopping away, the receiver stays on the same frequency for another ${EXTEND_MS} ms (at most ${MAX_EXTENSIONS} times in a row). This is a fixed rule, so no score is computed.`,
};
