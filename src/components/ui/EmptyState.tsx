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
 *     we want the user to act; `positive` for "all caught up".
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
  /** Serif sentence ending in a period. */
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
      className={[
        "tactile relative overflow-hidden rounded-[var(--app-radius-lg)] px-6 py-10 text-center",
        className ?? "",
      ].join(" ")}
      style={{
        background: `radial-gradient(80% 60% at 30% 20%, ${t.bg}, var(--app-bg-elevated))`,
        border: "1px solid var(--app-border)",
      }}
    >
      <span
        aria-hidden
        className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          background: `color-mix(in srgb, ${t.color} 22%, var(--app-bg-elevated))`,
          color: t.color,
        }}
      >
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h3
        className="font-serif text-[20px] font-semibold leading-tight tracking-tight"
        style={{ color: "var(--app-ink)" }}
      >
        {title}
      </h3>
      {body && (
        <p
          className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-pretty"
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
              tone === "brand" ? "var(--app-brand-press)" : "var(--app-bg-elevated)",
            color: tone === "brand" ? "var(--app-on-brand)" : t.color,
            boxShadow: tone === "brand" ? "var(--app-shadow-1)" : undefined,
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
