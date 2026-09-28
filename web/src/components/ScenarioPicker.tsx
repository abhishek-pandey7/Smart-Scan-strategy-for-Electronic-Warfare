"use client";

import { briefing } from "@/lib/scenarios";

/** Simulated scenario ids shown as picker cards (plus one real-dataset slot). */
export const SIM_SCENARIOS = ["easy", "lockout", "popup", "dense", "mixed"] as const;

export type ScenarioPickerProps = {
  selected: string;
  onSelect: (id: string) => void;
  /** First `turing:*` id from the catalog, if any. */
  turingId?: string | null;
  disabled?: boolean;
  /** Scenario currently being computed; its card shows a running state. */
  pendingId?: string | null;
};

export default function ScenarioPicker({ selected, onSelect, turingId, disabled, pendingId }: ScenarioPickerProps) {
  const ids = [...SIM_SCENARIOS, ...(turingId ? [turingId] : [])];
  return (
    <div className="scenario-picker" role="listbox" aria-label="Scenario">
      {ids.map((id) => {
        const b = briefing(id);
        const active = id === selected;
        const real = id.startsWith("turing:");
        const pending = id === pendingId;
        return (
          <button
            key={id}
            type="button"
            role="option"
            aria-selected={active}
            aria-busy={pending || undefined}
            disabled={disabled}
            className={["scenario-card", active && "scenario-card-active", real && "scenario-card-real"].filter(Boolean).join(" ")}
            onClick={() => onSelect(id)}
          >
            <span className="scenario-card-eyebrow">{pending ? "Running…" : real ? "Real dataset" : "Simulated"}</span>
            <strong className="scenario-card-title">{b.short}</strong>
            <span className="scenario-card-tag">{b.tagline ?? b.tests}</span>
          </button>
        );
      })}
    </div>
  );
}
