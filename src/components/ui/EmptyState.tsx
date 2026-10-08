import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * EmptyState — the canonical "nothing here yet" surface.
 *
 * Empty states used to vary across the app: some had copy + an
 * icon, some had a tinted block, others rendered as bare bordered
 * text. This component standardizes the pattern so a user lands on
 * a designed moment instead of a phantom layout.
 *
 * Composition rules:
 *   - Icon is REQUIRED — every empty state earns visual identity.
 *     Use a category-relevant Lucide icon, not a generic Inbox.
 *   - `title` is a serif sentence ending in a period; reads like a
 *     statement, not an error ("Nothing on the calendar for
 *     tonight.").
 *   - `body` is the explanation. Plain sans, short.
 *   - Optional primary CTA + secondary inline link. Use sparingly —
 *     an empty state with two CTAs and a back-link reads as a panic
 *     screen, not a calm absence.
 *   - The "tone" controls the accent color of the icon halo + CTA.
 *     `quiet` is the default (ink tones); `brand` for moments where
 *     we want the user to act; `positive` for "all caught up";
 *     `caution` for delayed or degraded states.
 *
 * Mobile improvements (2026-09):
 *   - Reduced padding at narrow viewports (320-375px)
 *   - Minimum tap target of 44px maintained for CTAs
 *   - Icon halo size adapts to viewport width
 *
 * Examples:
 *   <EmptyState
 *     icon={Calendar}
 *     title="Nothing on tonight's calendar yet."
 *     body="Try a wider time window, or come back at 5."
 *     cta={{ label: "See this weekend", href: "/events?lens=weekend" }}
 *   />
 */
export type EmptyStateTone = "quiet" | "brand" | "positive" | "caution";

const TONE: Record<EmptyStateTone, { color: string; bg: string }> = {
  quiet: {
    color: "var(--app-ink-3)",
    bg: "color-mix(in srgb, var(--app-ink-3) 12%, var(--app-bg-elevated))",
  },
  brand: {
    color: "var(--app-brand)",
    bg: "color-mix(in srgb, var(--app-brand) 14%, var(--app-bg-elevated))",
  },
  positive: {
    color: "var(--app-positive)",
    bg: "color-mix(in srgb, var(--app-positive) 14%, var(--app-bg-elevated))",
  },
  caution: {
    color: "var(--app-amber)",
    bg: "color-mix(in srgb, var(--app-amber) 14%, var(--app-bg-elevated))",
  },
};

export default function EmptyState({
  icon: Icon,
  title,
  body,
  tone = "quiet",
  cta,
  secondary,
  compact = false,
  className,
}: {
  icon: LucideIcon;
  /** Serif sentence ending in a period. */
  title: string;
  /** Optional explanation paragraph. */
  body?: ReactNode;
  tone?: EmptyStateTone;
  /** Primary action. */
  cta?: { label: string; href: string };
  /** Optional secondary text link below the CTA. */
  secondary?: { label: string; href: string };
  /** Compact mode for tight spaces (smaller padding, icon) */
  compact?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      className={[
        "tactile relative overflow-hidden rounded-[var(--app-radius-lg)] text-center",
        compact ? "px-4 py-6 sm:px-5 sm:py-8" : "px-5 py-8 sm:px-6 sm:py-10",
        className ?? "",
      ].join(" ")}
      style={{
        background: `radial-gradient(80% 60% at 30% 20%, ${t.bg}, var(--app-bg-elevated))`,
        border: "1px solid var(--app-border)",
      }}
    >
      <span
        aria-hidden
        className={[
          "mx-auto mb-3 inline-flex items-center justify-center rounded-full",
          compact ? "h-10 w-10" : "h-12 w-12",
        ].join(" ")}
        style={{
          background: `color-mix(in srgb, ${t.color} 22%, var(--app-bg-elevated))`,
          color: t.color,
        }}
      >
        <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} strokeWidth={1.75} />
      </span>
      <h3
        className={[
          "font-serif font-semibold leading-tight tracking-tight",
          compact ? "text-[17px] sm:text-[19px]" : "text-[18px] sm:text-[20px]",
        ].join(" ")}
        style={{ color: "var(--app-ink)" }}
      >
        {title}
      </h3>
      {body && (
        <p
          className={[
            "mx-auto mt-1.5 max-w-sm leading-relaxed text-pretty",
            compact ? "text-[12px] sm:text-[13px]" : "text-[13px]",
          ].join(" ")}
          style={{ color: "var(--app-ink-2)" }}
        >
          {body}
        </p>
      )}
      {cta && (
        <Link
          href={cta.href}
          className="tap-44 mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold tactile tactile-interactive"
          style={{
            background:
              tone === "brand" || tone === "caution"
                ? tone === "brand" ? "var(--app-brand-press)" : "var(--app-amber)"
                : "var(--app-bg-elevated)",
            color: tone === "brand" || tone === "caution" ? "var(--app-on-brand)" : t.color,
            boxShadow: tone === "brand" || tone === "caution" ? "var(--app-shadow-1)" : undefined,
          }}
        >
          {cta.label}
        </Link>
      )}
      {secondary && (
        <div className="mt-3">
          <Link
            href={secondary.href}
            className="tap-44-y inline-flex text-[12px] underline-offset-2 hover:underline"
            style={{ color: "var(--app-ink-3)" }}
          >
            {secondary.label}
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * CompactEmptyState — a smaller inline empty state for tight spaces like
 * collapsed sections, inline panels, or mobile drawers. Maintains minimum
 * tap targets while reducing visual weight.
 */
export function CompactEmptyState({
  icon: Icon,
  title,
  body,
  tone = "quiet",
  action,
}: {
  icon: LucideIcon;
  /** Short statement (no period needed for compact) */
  title: string;
  /** Optional short explanation */
  body?: string;
  tone?: EmptyStateTone;
  /** Optional action button */
  action?: { label: string; onClick: () => void };
}) {
  const t = TONE[tone];
  return (
    <div
      className="flex items-start gap-3 rounded-[var(--app-radius-md)] border px-3 py-3"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `color-mix(in srgb, ${t.color} 18%, var(--app-bg-elevated))`,
          color: t.color,
        }}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p
          className="text-[13px] font-semibold leading-snug"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </p>
        {body && (
          <p
            className="mt-0.5 text-[11.5px] leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            {body}
          </p>
        )}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-2 min-h-[36px] rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-transform active:scale-[0.96]"
            style={{
              borderColor: t.color,
              color: t.color,
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
