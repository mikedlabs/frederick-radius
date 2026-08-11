"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

/**
 * FreshnessChip — visible age signal for any timestamped row.
 *
 * Three states based on age. Every label names the fact that was checked, so
 * an hours refresh cannot accidentally imply that the description, menu, and
 * accessibility information were checked at the same time.
 *
 * Says "Checked at source", never "Verified". Per the trust vocabulary each
 * badge means exactly one thing: "Checked" = we checked the available source
 * on this date; "Owner verified" is reserved for approved owner-managed
 * listings (which earn the stronger word). A freshness timestamp is a
 * confirmation date, not an owner endorsement, so it must not say
 * "Verified" — that was the badge-confusion the audit flagged.
 *
 * Honest by design: when the data is old, the chip says so — we'd
 * rather show the truth quietly than imply false freshness.
 */
export type FreshnessSubject = "Listing" | "Hours" | "Event";

function formatAge(
  ms: number,
  subject: FreshnessSubject,
): { tier: "fresh" | "recent" | "stale"; label: string } {
  const days = ms / 86_400_000;
  if (days < 1) {
    const hrs = Math.max(1, Math.round(ms / 3_600_000));
    return { tier: "fresh", label: `${subject} checked at source · ${hrs}h ago` };
  }
  if (days < 14) {
    return { tier: "fresh", label: `${subject} checked at source · ${Math.round(days)}d ago` };
  }
  return { tier: days < 90 ? "recent" : "stale", label: "" };
}

function formatAbsolute(
  d: Date,
  stale: boolean,
  subject: FreshnessSubject,
): string {
  const opts: Intl.DateTimeFormatOptions = stale
    ? { month: "short", year: "numeric" }
    : { month: "short", day: "numeric" };
  const prefix = stale ? `${subject} last checked` : `${subject} checked`;
  return `${prefix} ${d.toLocaleDateString("en-US", opts)}`;
}

export function freshnessLabel({
  iso,
  now,
  subject,
}: {
  iso: string;
  now: number;
  subject: FreshnessSubject;
}): { tier: "fresh" | "recent" | "stale"; label: string } | null {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp) || timestamp > now) return null;
  const age = formatAge(now - timestamp, subject);
  return {
    tier: age.tier,
    label:
      age.label ||
      formatAbsolute(new Date(timestamp), age.tier === "stale", subject),
  };
}

// No-op subscription: we just want a server/client split for `now`
// without polling. The chip's age is rendered once per mount; the
// label is stable enough that we don't need to tick.
const subscribeNoop = () => () => {};
const getClientNow = () => Date.now();
const getServerNow = () => null;

export default function FreshnessChip({
  iso,
  subject = "Listing",
  className = "",
}: {
  iso: string | undefined;
  subject?: FreshnessSubject;
  className?: string;
}) {
  // `now` is null on the server and the real clock on the client.
  // Using useSyncExternalStore keeps the SSR HTML free of any
  // time-dependent content — the chip materializes after hydration.
  const now = useSyncExternalStore(subscribeNoop, getClientNow, getServerNow);

  if (!iso) return null;
  if (now === null) return null; // SSR + pre-hydration: render nothing
  const freshness = freshnessLabel({ iso, now, subject });
  if (!freshness) return null;
  const t = Date.parse(iso);
  const { tier, label: finalLabel } = freshness;

  // Hue lives on the ICON (graphical, 3:1 is enough); the readable label
  // uses an ink color that clears AA on cream. The stale state in
  // particular must not render its amber on small text.
  const palette =
    tier === "fresh"
      ? { color: "var(--app-positive)", textColor: "var(--app-positive)", Icon: CheckCircle2 }
      : tier === "recent"
      ? { color: "var(--app-ink-3)", textColor: "var(--app-ink-3)", Icon: Clock }
      : { color: "var(--app-warning)", textColor: "var(--app-ink-2)", Icon: AlertCircle };
  const { Icon } = palette;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${className}`}
      style={{ color: palette.textColor }}
      title={new Date(t).toLocaleString()}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: palette.color }} />
      {finalLabel}
    </span>
  );
}
