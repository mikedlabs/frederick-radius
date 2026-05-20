import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * SectionHeading — the one strong category header, reused by Shelf and
 * the Radius results grid (and available to any future surface). A
 * tick + serif title + a quiet count, optional trailing action.
 *
 * The tick color reads from `--section-accent` if a parent has set it
 * (so a whole route can theme its headings with one declaration on the
 * outer `<main>` or page wrapper), and falls back to `--app-brand`. An
 * explicit `accent` prop overrides per-instance.
 */
export default function SectionHeading({
  title,
  count,
  href,
  cta = "See all",
  onCtaClick,
  trailing,
  accent,
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
}) {
  const tickColor = accent ?? "var(--section-accent, var(--app-brand))";
  return (
    <header className="flex items-end justify-between gap-3">
      <h2
        className="flex items-center gap-2 font-serif text-[22px] font-semibold leading-none tracking-tight"
        style={{ color: "var(--app-ink)" }}
      >
        <span
          aria-hidden
          className="inline-block h-4 w-1 rounded-full"
          style={{ background: tickColor }}
        />
        {title}
        {count !== undefined && (
          <span
            className="text-base font-normal tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {count}
          </span>
        )}
      </h2>
      {trailing ??
        (onCtaClick ? (
          <button
            type="button"
            onClick={onCtaClick}
            className="inline-flex shrink-0 items-center gap-1 pb-0.5 text-xs font-semibold tracking-tight transition active:scale-[0.96]"
            style={{ color: tickColor }}
          >
            {cta}
          </button>
        ) : (
          href && (
            <Link
              href={href}
              className="inline-flex shrink-0 items-center gap-1 pb-0.5 text-xs font-semibold tracking-tight"
              style={{ color: tickColor }}
            >
              {cta}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          )
        ))}
    </header>
  );
}
