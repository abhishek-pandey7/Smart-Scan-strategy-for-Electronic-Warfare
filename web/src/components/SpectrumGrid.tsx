"use client";

import SpectrumCanvas from "@/components/SpectrumCanvas";
import { isReference, policyColorVar, policyLabel, type RunPayload } from "@/lib/api";

export type SpectrumGridProps = {
  data: RunPayload;
  cursor: number;
  /** Policy ids to show; Oracle is skipped by default (reference only). */
  policies?: readonly string[];
  height?: number;
};

export default function SpectrumGrid({ data, cursor, policies, height = 168 }: SpectrumGridProps) {
  const ids = (policies ?? data.request.policies).filter((p) => data.runs[p] && !isReference(p));

  return (
    <div className="spectrum-grid">
      {ids.map((p) => (
        <div key={p} className="spectrum-cell">
          <div className="spectrum-cell-head">
            <span className="swatch" style={{ background: `var(${policyColorVar(p)})` }} />
            <strong>{policyLabel(p)}</strong>
          </div>
          <SpectrumCanvas
            scenario={data.scenario}
            run={data.runs[p]}
            cursor={cursor}
            colorVar={policyColorVar(p)}
            height={height}
          />
        </div>
      ))}
    </div>
  );
}
