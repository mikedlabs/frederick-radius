import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * EmptyState: the canonical "nothing here yet" surface.
 *
 * Empty states used to vary across the app: some had copy + an
 * icon, some had a tinted block, others rendered as bare bordered
 * text. This component standardizes the pattern so a user lands on
 * a designed moment instead of a phantom layout.
 *
 * Composition rules (plain tool direction):
 *   - Plain text on the page ground under one hairline. No box, no
 *     halo, no gradient.
 *   - Icon is required, small and inline with the title. Use a
 *     category-relevant Lucide icon, not a generic Inbox.
 *   - `title` is a sans sentence ending in a period; reads like a
 *     statement, not an error ("Nothing on the calendar for
 *     tonight.").
 *   - `body` is the explanation. Plain sans, short.
 *   - One action: an outlined 6px button. The optional secondary is
 *     an underlined text link, never a second button.
 *   - The "tone" colors only the icon. `quiet` is the default;
 *     `brand` for moments where we want the user to act; `positive`
 *     for "all caught up".
 *
 * Examples:
 *   <EmptyState
 *     icon={Calendar}
 *     title="Nothing on tonight's calendar yet."
 *     body="Try a wider time window, or come back at 5."
 *     cta={{ label: "See this weekend", href: "/events?lens=weekend" }}
 *   />
 */
export type EmptyStateTone = "quiet" | "brand" | "positive";

// Plain tool: an empty state is plain text on the page ground with one
// action. The tone only colors the small leading icon; it never paints a
// box, a halo or a gradient. Colored icons use the theme-readable text roles.
const TONE: Record<EmptyStateTone, { color: string }> = {
  quiet: { color: "var(--app-ink-2)" },
  brand: { color: "var(--app-brand-text)" },
  positive: { color: "var(--app-forest-text)" },
};

export default function EmptyState({
  icon: Icon,
  title,
  body,
  tone = "quiet",
  cta,
  secondary,
  className,
}: {
  icon: LucideIcon;
  /** A system-sans sentence ending in a period. */
  title: string;
  /** Optional explanation paragraph. */
  body?: ReactNode;
  tone?: EmptyStateTone;
  /** Primary action. */
  cta?: { label: string; href: string };
  /** Optional secondary text link below the CTA. */
  secondary?: { label: string; href: string };
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      data-empty-state
      className={["border-t py-8", className ?? ""].join(" ")}
      style={{ borderColor: "var(--app-border)" }}
    >
      <h3
        className="flex items-start gap-2 font-sans text-[17px] font-semibold leading-snug tracking-[-0.01em] text-pretty"
        style={{ color: "var(--app-ink)" }}
      >
        <Icon aria-hidden className="mt-[3px] h-[18px] w-[18px] shrink-0" strokeWidth={1.75} style={{ color: t.color }} />
        <span className="min-w-0">{title}</span>
      </h3>
      {body && (
        <p
          className="mt-1.5 max-w-prose pl-[26px] text-[14px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          {body}
        </p>
      )}
      {cta && (
        <div className="mt-4 pl-[26px]">
          <Link
            href={cta.href}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-md)] border px-4 text-[14px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-control-border)", background: "var(--app-bg)", color: "var(--app-ink)" }}
          >
            {cta.label}
          </Link>
        </div>
      )}
      {secondary && (
        <div className="mt-2 pl-[26px]">
          <Link
            href={secondary.href}
            className="tap-44-y inline-flex text-[13px] underline underline-offset-2"
            style={{ color: "var(--app-ink-2)" }}
          >
            {secondary.label}
          </Link>
        </div>
      )}
    </div>
  );
}
