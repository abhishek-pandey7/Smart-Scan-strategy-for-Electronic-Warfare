import type { CSSProperties, ReactNode } from "react";

export type CardProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned content in the header row (buttons, badges, live counters). */
  actions?: ReactNode;
  /** Colour of a 4px left rule, e.g. policyColor("primes"). */
  accent?: string;
  /** "flat" drops the border and shadow; "tint" uses the recessed surface; "glass" is translucent over the page glow. */
  variant?: "default" | "flat" | "tint" | "glass";
  pad?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export default function Card({ title, subtitle, actions, accent, variant = "default", pad = "md", className, style, children }: CardProps) {
  const cls = ["card", `card-pad-${pad}`, variant !== "default" && `card-${variant}`, accent && "card-accent", className]
    .filter(Boolean).join(" ");
  return (
    <section className={cls} style={accent ? { borderLeftColor: accent, ...style } : style}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {!title && subtitle && <p className="card-sub">{subtitle}</p>}
      {children}
    </section>
  );
}
