import type { ReactNode } from "react";

export type StatProps = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** Small line under the value, e.g. "of 42 flashes". */
  hint?: ReactNode;
  /** Colour of the value and of the swatch before the label. */
  color?: string;
  size?: "md" | "lg" | "xl";
  align?: "left" | "right";
  className?: string;
};

export default function Stat({ label, value, unit, hint, color, size = "lg", align = "left", className }: StatProps) {
  return (
    <div className={["stat", `stat-${size}`, align === "right" && "stat-right", className].filter(Boolean).join(" ")}>
      <div className="stat-label">
        {color && <span className="swatch" style={{ background: color }} />}
        {label}
      </div>
      <div className="stat-value" style={color ? { color } : undefined}>
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
