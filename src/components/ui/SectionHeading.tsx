import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * SectionHeading: the one strong category header, reused by Shelf and
 * the Radius results grid (and available to any future surface). A bold
 * system-sans title, a quiet count and one hairline, with an optional
 * trailing action. Plain tool direction: no accent tick; type and the rule
 * carry the break.
 *
 * The action color is `--app-heading-action` when a parent sets it (the
 * four primary tabs set it to `--app-link`). Otherwise it blends the route
 * accent (`--section-accent`, else `--app-brand`) 60% toward the theme's
 * ink so small action text stays readable in both appearances. An explicit
 * `accent` prop replaces the route accent for one heading.
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
  /** Heading register. Both use the device's System Sans and neither draws
   * a tick. `lg` is the bold 20px section title; `sm` is the bold 16px
   * subhead. */
  size?: "lg" | "sm";
}) {
  const accentColor = accent ?? "var(--section-accent, var(--app-brand))";
  // Small action text blends the accent toward the theme's ink unless its
  // context supplies an explicit readable action color.
  const ctaColor = `color-mix(in srgb, ${accentColor} 60%, var(--app-ink))`;
  const small = size === "sm";
  const hasTrailingAction = Boolean(trailing || onCtaClick || href);
  return (
    <header className="section-heading flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1 min-[360px]:flex-nowrap">
      <h2
        className={`${small
            ? "flex min-w-0 items-baseline gap-2 font-sans text-[16px] font-bold leading-tight tracking-[-0.01em]"
            : "flex min-w-0 items-baseline gap-2 font-sans text-[20px] font-bold leading-tight tracking-[-0.02em]"}${hasTrailingAction ? " max-[359px]:basis-full" : ""}`}
        style={{ color: "var(--app-ink)" }}
      >
        {/* PLAIN TOOL: no accent tick. A sentence-case heading one clear step
            above the 17px row titles, then a hairline, carries the break. */}
        <span
          className="truncate"
          style={{
            backgroundImage: "var(--app-heading-image, none)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "var(--app-heading-fill, currentColor)",
          }}
        >
          {title}
        </span>
        {count !== undefined && (
          <span
            className={`font-sans ${small ? "text-[13px]" : "text-[15px]"} font-medium tabular-nums tracking-normal`}
            style={{ color: "var(--app-ink-3)" }}
          >
            {count}
          </span>
        )}
      </h2>
      <span
        aria-hidden
        className="mb-[0.45rem] hidden h-px min-w-4 flex-1 min-[360px]:block"
        style={{
          background: "var(--app-border)",
        }}
      />
      {trailing ? (
        <span className="max-[359px]:ml-auto">{trailing}</span>
      ) : onCtaClick ? (
          <button
            type="button"
            onClick={onCtaClick}
            className="tap-44-y -mx-1 inline-flex shrink-0 items-center gap-1 px-1 pb-0.5 text-xs font-semibold tracking-tight transition active:scale-[0.96] max-[359px]:ml-auto"
            style={{ color: `var(--app-heading-action, ${ctaColor})` }}
          >
            {cta}
          </button>
        ) : (
          href && (
            <Link
              href={href}
              className="tap-44-y -mx-1 inline-flex shrink-0 items-center gap-1 px-1 pb-0.5 text-xs font-semibold tracking-tight max-[359px]:ml-auto"
              style={{ color: `var(--app-heading-action, ${ctaColor})` }}
            >
              {cta}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          )
        )}
    </header>
  );
}
