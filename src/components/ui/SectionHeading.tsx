import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * SectionHeading — the one strong section header, reused by Shelf, category
 * pages, the Radius results grid, and PageChapter. Hierarchy comes from type
 * alone: the primary register is `.text-title` (Public Sans 20 semibold) in
 * solid Ink with a 4px tick, and the secondary register is `.text-title-sm`
 * (Public Sans 16 semibold) with no tick. Pass titles in sentence case. There
 * are no tracked caps, no gradient-filled text, and no trailing hairline: the
 * October 2026 review found that the rule and the inline count made every
 * section read as page furniture rather than a heading.
 *
 * The count is supporting detail, never part of the heading's name. When the
 * heading links somewhere, the count rides in the link ("See all 183");
 * otherwise it follows the title in quiet metadata type.
 *
 * The tick color reads from `--section-accent` if a parent has set it (so a
 * whole route can theme its headings with one declaration on the outer
 * `<main>` or page wrapper), and falls back to `--app-brand`. An explicit
 * `accent` prop overrides per-instance. The CTA is always Brick press text,
 * which holds AA contrast on Cream whatever the route accent is.
 */
export default function SectionHeading({
  title,
  count,
  href,
  cta = "See all",
  onCtaClick,
  trailing,
  accent,
  size = "lg",
}: {
  title: string;
  count?: number;
  href?: string;
  cta?: string;
  /** Render a button instead of a link when set. Overrides `href`. */
  onCtaClick?: () => void;
  /** Optional control rendered on the right (e.g. a density toggle). */
  trailing?: React.ReactNode;
  /** Override the route accent for a single heading. */
  accent?: string;
  /** Heading register. `lg` is the primary section title (`.text-title` plus
   *  the 4px tick); `sm` is the one lighter subhead register for secondary
   *  sections (`.text-title-sm`, no tick), so hierarchy reads from type, not
   *  per-section invention. */
  size?: "lg" | "sm";
}) {
  const tickColor = accent ?? "var(--section-accent, var(--app-brand))";
  const small = size === "sm";
  const hasTrailingAction = Boolean(trailing || onCtaClick || href);
  // Only a link CTA carries the count. A button CTA (Show all / Show less)
  // toggles in place, so a number inside it would be ambiguous.
  const ctaIsLink = !trailing && !onCtaClick && Boolean(href);
  const countInCta = ctaIsLink && count !== undefined;
  const ctaClassName =
    "-mx-1 -my-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end gap-1 px-1 text-body font-semibold transition-opacity active:opacity-70 max-[359px]:ml-auto";
  const ctaStyle = { color: "var(--app-brand-press)" };

  return (
    <header className="section-heading flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 min-[360px]:flex-nowrap">
      <div
        className={`flex min-w-0 flex-1 items-center gap-2${hasTrailingAction ? " max-[359px]:basis-full" : ""}`}
      >
        {small ? null : (
          <span
            aria-hidden
            data-section-heading-tick
            className="inline-block h-4 w-1 shrink-0 rounded-full"
            style={{ background: tickColor }}
          />
        )}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h2
            className={`${small ? "text-title-sm" : "text-title"} min-w-0 font-sans text-pretty`}
            style={{ color: "var(--app-ink)" }}
          >
            {title}
          </h2>
          {count !== undefined && !countInCta ? (
            <span
              data-section-heading-count
              className="text-meta-lg tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {count}
            </span>
          ) : null}
        </div>
      </div>
      {trailing ? (
        <span className="shrink-0 max-[359px]:ml-auto">{trailing}</span>
      ) : onCtaClick ? (
        <button type="button" onClick={onCtaClick} className={ctaClassName} style={ctaStyle}>
          {cta}
        </button>
      ) : href ? (
        <Link href={href} className={ctaClassName} style={ctaStyle}>
          {countInCta ? `${cta} ${count}` : cta}
          <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
        </Link>
      ) : null}
    </header>
  );
}
