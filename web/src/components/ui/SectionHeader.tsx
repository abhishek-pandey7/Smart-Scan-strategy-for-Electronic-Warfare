import type { ReactNode } from "react";

export type SectionHeaderProps = {
  /** Small uppercase label above the title, e.g. "Step 2". */
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** h1 for page titles, h2 (default) for sections. */
  as?: "h1" | "h2" | "h3";
  id?: string;
  className?: string;
};

export default function SectionHeader({ eyebrow, title, lede, actions, as: H = "h2", id, className }: SectionHeaderProps) {
  return (
    <div className={["section-head", `section-head-${H}`, className].filter(Boolean).join(" ")} id={id}>
      <div className="section-head-text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <H>{title}</H>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="section-head-actions">{actions}</div>}
    </div>
  );
}
