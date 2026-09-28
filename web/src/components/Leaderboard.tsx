"use client";

import { useMemo, type CSSProperties } from "react";
import { atCursor, isReference, policyColor, policyLabel, type RunPayload } from "@/lib/api";
import styles from "./Leaderboard.module.css";

export type LeaderboardProps = {
  data: RunPayload;
  cursor: number;
  /** Policy ids to rank; defaults to the run request lineup. */
  policies?: readonly string[];
  /** Two-line rows that slide to their new rank; sized for a narrow side column. */
  compact?: boolean;
};

export default function Leaderboard({ data, cursor, policies, compact = false }: LeaderboardProps) {
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

  if (compact) {
    const rank = new Map(ranked.map((r, i) => [r.policy, i]));
    // Stable DOM order so each row keeps its element and the transform animates the re-rank.
    const stable = [...ranked].sort((a, b) => a.policy.localeCompare(b.policy));
    return (
      <ol className={styles.list} style={{ ["--rows" as string]: ranked.length } as CSSProperties} aria-live="polite">
        {stable.map((r) => {
          const i = rank.get(r.policy) ?? 0;
          const ref = isReference(r.policy);
          return (
            <li key={r.policy} className={[styles.row, ref && styles.ref].filter(Boolean).join(" ")}
              style={{ ["--rank" as string]: i } as CSSProperties} aria-posinset={i + 1} aria-setsize={ranked.length}>
              <span className={styles.rank}>{i + 1}</span>
              <span className={styles.name}>
                <span className="swatch" style={{ background: policyColor(r.policy) }} />
                <span className={styles.label}>{policyLabel(r.policy)}</span>
                {ref && <span className={styles.tag}>upper bound</span>}
              </span>
              <span className={styles.score}>
                <strong>{r.intercepted}</strong>
                <span className={styles.unit}> flashes</span>
              </span>
              <span className={styles.track}>
                <span className={styles.fill} style={{
                  width: `${Math.min(100, (100 * r.intercepted) / maxCaught)}%`,
                  background: policyColor(r.policy),
                }} />
              </span>
              <span className={styles.found}>{r.discovered}/{emitters} found</span>
            </li>
          );
        })}
      </ol>
    );
  }

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
