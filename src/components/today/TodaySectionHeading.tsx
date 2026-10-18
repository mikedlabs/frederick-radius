import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The shared heading anatomy for Today’s main briefing sections.
 *
 * It keeps the page feeling like one edited field guide: a quiet classification
 * line when needed, a display title, one compact status line, and a solid
 * registration rule. The component is intentionally a header, not another card.
 */
export default function TodaySectionHeading({
  title,
  meta,
  eyebrow,
  plateNo,
  href,
  cta = "See all",
  live = false,
}: {
  title: string;
  meta?: ReactNode;
  eyebrow?: string;
  plateNo?: string;
  href?: string;
  cta?: string;
  live?: boolean;
}) {
  return (
    <header
      data-today-section-heading="true"
      className="today-section-heading mb-3 min-w-0 max-w-full"
    >
      <div className="today-section-heading__copy flex min-w-0 max-w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-0.5">
        <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">
          {eyebrow && <p className="fg-eyebrow mb-1.5">{eyebrow}</p>}
          <h2
            className="flex min-w-0 max-w-full items-center gap-2 font-sans text-xl font-semibold leading-none tracking-tight sm:text-[1.3125rem]"
            style={{ color: "var(--app-ink)" }}
          >
            {live && (
              <span
                aria-hidden
                className="live-dot h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    "var(--today-section-accent, var(--app-brand))",
                }}
              />
            )}
            <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
          </h2>
          {meta && (
            <p
              className="mt-1.5 font-mono text-xs leading-snug tabular-nums tracking-[0.03em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {meta}
            </p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            aria-label={`${cta}: ${title}`}
            className="today-section-heading__cta tap-44-y inline-flex min-h-11 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-[var(--app-radius-sm)] px-1.5 text-sm font-semibold tracking-tight outline-none"
            style={{
              color:
                "var(--app-heading-action, var(--today-section-ink, var(--app-brand-press)))",
            }}
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">{cta}</span>
            <ArrowRight
              className="today-section-heading__cta-icon h-3.5 w-3.5 shrink-0"
              strokeWidth={2.1}
              aria-hidden
            />
          </Link>
        )}
      </div>
      <div
        className="today-section-heading__registration mt-3 flex items-center gap-2"
        aria-hidden
      >
        <span
          className="today-section-heading__registration-accent h-[3px] w-8 shrink-0 rounded-full"
          style={{
            background:
              "var(--app-heading-rule, var(--today-section-accent, var(--app-brand)))",
          }}
        />
        <span
          className="today-section-heading__registration-rule h-px flex-1"
          style={{ background: "var(--app-border)" }}
        />
        {plateNo && (
          <span className="today-section-heading__plate fg-plate-no shrink-0">
            {plateNo}
          </span>
        )}
      </div>
    </header>
  );
}
