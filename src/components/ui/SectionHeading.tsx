import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * SectionHeading — the one strong category header, reused by Shelf and
 * the Radius results grid (and available to any future surface). A
 * tick + editorial title + a quiet count, optional trailing action.
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
  /** Heading register. `lg` is the primary section title (Caslon 22 + full
   *  tick); `sm` is the one lighter subhead register for secondary sections
   *  (Public Sans 16 + a shorter tick), so hierarchy reads from type, not per-section
   *  invention. */
  size?: "lg" | "sm";
}) {
  const tickColor = accent ?? "var(--section-accent, var(--app-brand))";
  // The tick is decorative and keeps the true accent; the CTA is 12px TEXT
  // and must hold 4.5:1 — the raw brand red (3.7:1 on cream) fails, so the
  // text color is the accent pulled 40% toward ink (axe-verified, Jul 2026).
  const ctaColor = `color-mix(in srgb, ${tickColor} 60%, var(--app-ink))`;
  const small = size === "sm";
  return (
    <header className="flex items-end justify-between gap-3">
      <h2
        className={
          small
            ? "flex items-center gap-2 font-sans text-[16px] font-semibold leading-none tracking-tight"
            : "flex items-center gap-2 font-serif text-[22px] leading-none tracking-tight"
        }
        style={{ color: "var(--app-ink)" }}
      >
        <span
          aria-hidden
          className={small ? "inline-block h-3 w-1 rounded-full" : "inline-block h-4 w-1 rounded-full"}
          style={{ background: tickColor }}
        />
        {title}
        {count !== undefined && (
          <span
            className={small ? "font-data text-sm font-normal" : "font-data text-base font-normal"}
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
            className="tap-44-y -mx-1 inline-flex shrink-0 items-center gap-1 px-1 pb-0.5 text-xs font-semibold tracking-tight transition active:scale-[0.96]"
            style={{ color: ctaColor }}
          >
            {cta}
          </button>
        ) : (
          href && (
            <Link
              href={href}
              className="tap-44-y -mx-1 inline-flex shrink-0 items-center gap-1 px-1 pb-0.5 text-xs font-semibold tracking-tight"
              style={{ color: ctaColor }}
            >
              {cta}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          )
        ))}
    </header>
  );
}
