import type { ReactNode } from "react";
import SectionHeading from "./SectionHeading";

export type PageChapterTone =
  | "brand"
  | "civic"
  | "forest"
  | "amber"
  | "neutral";

/**
 * A field-guide chapter for long editorial pages.
 *
 * The chapter names a real change of subject with a real heading: the label
 * renders as an h2 through SectionHeading's primary register (`.text-title`
 * Ink in sentence case, with the 4px tick in the chapter's tone), not as tiny
 * tracked caps. Headings are type (docs/brand/BRAND_GUIDE.md). The group keeps
 * its accessible name equal to the label, because Today's layout tests find
 * the chapter by role and name. An optional folio number sits before the
 * heading as quiet tabular metadata.
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
      <div className="content-chapter__register">
        {index ? (
          <span
            aria-hidden
            data-chapter-folio
            className="text-meta-lg shrink-0 font-semibold tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {index}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <SectionHeading title={label} accent="var(--content-chapter-accent, var(--app-brand))" />
        </div>
      </div>
      <div className={`content-chapter__body${bodyClassName ? ` ${bodyClassName}` : ""}`}>
        {children}
      </div>
    </div>
  );
}
