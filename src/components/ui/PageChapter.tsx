import type { ReactNode } from "react";

export type PageChapterTone =
  | "brand"
  | "civic"
  | "forest"
  | "amber"
  | "neutral";

/**
 * A field-guide chapter for long editorial pages.
 *
 * The register makes a real change of subject legible without adding another
 * card or toolbar. Children keep their own semantic headings; this wrapper
 * supplies the visual rhythm, grouping, and optional folio number.
 */
export default function PageChapter({
  label,
  index,
  tone = "brand",
  className = "",
  bodyClassName = "",
  variant = "chapter",
  children,
}: {
  label: string;
  index?: string;
  tone?: PageChapterTone;
  className?: string;
  bodyClassName?: string;
  variant?: "chapter" | "plain";
  children?: ReactNode;
}) {
  return (
    <div
      className={`content-chapter content-chapter--${tone} content-chapter--${variant}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={label}
    >
      <div className="content-chapter__register" aria-hidden>
        {index ? <span className="content-chapter__folio">{index}</span> : null}
        <span className="content-chapter__label">{label}</span>
        <span className="content-chapter__rule" />
      </div>
      <div className={`content-chapter__body${bodyClassName ? ` ${bodyClassName}` : ""}`}>
        {children}
      </div>
    </div>
  );
}
