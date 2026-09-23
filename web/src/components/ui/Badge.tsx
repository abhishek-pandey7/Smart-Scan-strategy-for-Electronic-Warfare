import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "good" | "warn" | "critical" | "outline";

export type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  /** Shows a coloured dot before the text, e.g. policyColor(p). */
  dot?: string;
  size?: "sm" | "md";
  title?: string;
  className?: string;
};

export default function Badge({ children, tone = "neutral", dot, size = "sm", title, className }: BadgeProps) {
  return (
    <span className={["badge", `badge-${tone}`, size === "md" && "badge-md", className].filter(Boolean).join(" ")} title={title}>
      {dot && <span className="badge-dot" style={{ background: dot }} />}
      {children}
    </span>
  );
}
