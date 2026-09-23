"use client";

import { useMemo } from "react";
import { atCursor, isReference, policyColor, policyLabel, type RunPayload } from "@/lib/api";

export type LeaderboardProps = {
  data: RunPayload;
  cursor: number;
  /** Policy ids to rank; defaults to the run request lineup. */
  policies?: readonly string[];
};

export default function Leaderboard({ data, cursor, policies }: LeaderboardProps) {
  const ids = policies ?? data.request.policies;
  const emitters = data.scenario.emitters.length;

  const ranked = useMemo(() => {
    return ids
      .filter((p) => data.runs[p])
      .map((p) => {
        const pt = atCursor(data.runs[p].timeline, cursor);
        return { policy: p, intercepted: pt.intercepted, discovered: pt.discovered };
      })
      .sort((a, b) => b.intercepted - a.intercepted || b.discovered - a.discovered || a.policy.localeCompare(b.policy));
  }, [data, cursor, ids]);

  const maxCaught = Math.max(1, ...ranked.map((r) => r.intercepted));

  return (
    <div className="leaderboard" aria-live="polite">
      <ol className="leaderboard-list">
        {ranked.map((r, i) => (
          <li key={r.policy} className={["leaderboard-row", isReference(r.policy) && "leaderboard-ref"].filter(Boolean).join(" ")}>
            <span className="leaderboard-rank mono muted">{i + 1}</span>
            <span className="leaderboard-name key">
              <span className="swatch" style={{ background: policyColor(r.policy) }} />
              {policyLabel(r.policy)}
              {isReference(r.policy) && <span className="muted small"> · upper bound</span>}
            </span>
            <span className="leaderboard-bar-wrap">
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, (100 * r.intercepted) / maxCaught)}%`,
                    background: policyColor(r.policy),
                    ...(isReference(r.policy) ? { opacity: 0.55 } : null),
                  }}
                />
              </span>
            </span>
            <span className="leaderboard-stats mono">
              <strong>{r.intercepted}</strong>
              <span className="muted"> flashes</span>
              <span className="muted"> · </span>
              <strong>{r.discovered}</strong>
              <span className="muted"> / {emitters} found</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
