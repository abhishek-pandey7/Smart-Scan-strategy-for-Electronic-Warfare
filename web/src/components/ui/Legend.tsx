import { policyColor, policyDash, policyLabel } from "@/lib/api";

export type LegendItem = { key: string; label: string; color: string; dashed?: boolean };

export type LegendProps = {
  /** Policy ids; label, colour and dash come from api.ts. */
  policies?: readonly string[];
  /** Arbitrary items, appended after policies. */
  items?: LegendItem[];
  /** "line" draws a short stroke (for line charts), "swatch" a square. */
  shape?: "swatch" | "line";
  className?: string;
};

export default function Legend({ policies = [], items = [], shape = "swatch", className }: LegendProps) {
  const all: LegendItem[] = [
    ...policies.map((p) => ({ key: p, label: policyLabel(p), color: policyColor(p), dashed: !!policyDash(p) })),
    ...items,
  ];
  return (
    <div className={["legend", className].filter(Boolean).join(" ")}>
      {all.map((it) => (
        <span key={it.key} className="key">
          {shape === "line" || it.dashed ? (
            <svg width={22} height={10} aria-hidden>
              <line x1={1} x2={21} y1={5} y2={5} stroke={it.color} strokeWidth={3} strokeLinecap="round"
                strokeDasharray={it.dashed ? "5 4" : undefined} />
            </svg>
          ) : (
            <span className="swatch" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}
