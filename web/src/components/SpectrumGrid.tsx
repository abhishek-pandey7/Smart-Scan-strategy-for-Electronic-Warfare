"use client";

import type { ReactNode } from "react";
import SpectrumCanvas from "@/components/SpectrumCanvas";
import { atCursor, isReference, policyColorVar, policyLabel, type RunPayload } from "@/lib/api";

export type SpectrumGridProps = {
  data: RunPayload;
  cursor: number;
  /** Policy ids to show; Oracle is skipped by default (reference only). */
  policies?: readonly string[];
  height?: number;
  /** Canvases size to their cells (the grid and cells need definite heights, e.g. via className). */
  fill?: boolean;
  /** Replaces the default grid class. */
  className?: string;
  /** Replaces the default cell class. */
  cellClassName?: string;
  /** Extra cells appended after the spectrum cells. */
  children?: ReactNode;
};

export default function SpectrumGrid({ data, cursor, policies, height = 168, fill = false, className, cellClassName, children }: SpectrumGridProps) {
  const ids = (policies ?? data.request.policies).filter((p) => data.runs[p] && !isReference(p));

  return (
    <div className={className ?? "spectrum-grid"}>
      {ids.map((p) => {
        const now = fill ? atCursor(data.runs[p].timeline, cursor) : null;
        return (
          <div key={p} className={cellClassName ?? "spectrum-cell"}
            style={fill ? { display: "flex", flexDirection: "column", minHeight: 0 } : undefined}>
            <div className="spectrum-cell-head" style={fill ? { marginBottom: 6 } : undefined}>
              <span className="swatch" style={{ background: `var(${policyColorVar(p)})` }} />
              <strong>{policyLabel(p)}</strong>
              {now && (
                <span className="mono muted" style={{ marginLeft: "auto", fontSize: 13 }}>
                  <strong style={{ color: "var(--text-primary)" }}>{now.intercepted}</strong> flashes · {now.discovered}/{data.scenario.emitters.length} found
                </span>
              )}
            </div>
            {fill ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SpectrumCanvas scenario={data.scenario} run={data.runs[p]} cursor={cursor} colorVar={policyColorVar(p)} fill />
              </div>
            ) : (
              <SpectrumCanvas scenario={data.scenario} run={data.runs[p]} cursor={cursor} colorVar={policyColorVar(p)} height={height} />
            )}
          </div>
        );
      })}
      {children}
    </div>
  );
}
