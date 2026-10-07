"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { freshnessPhrase, type FreshnessBasis } from "@/lib/trust-language";

/**
 * FreshnessChip — visible age signal for any timestamped row.
 *
 * Three states based on age. Every label names the fact that was checked, so
 * an hours refresh cannot accidentally imply that the description, menu, and
 * accessibility information were checked at the same time.
 *
 * Says "checked at source", never "Verified", and only for a real check (a
 * person, or Radius against a named source). Per the trust vocabulary each
 * badge means exactly one thing: "Owner verified" is reserved for approved
 * owner-managed listings, and an automated calendar read says what it is,
 * "Calendar read 1 hour ago". The words and the date format come from the
 * trust-language table: "4 hours ago" inside a day, then "Jun 15".
 *
 * Honest by design: when the data is old, the chip says so through its
 * stale tier. We'd rather show the truth quietly than imply false freshness.
 */
export type FreshnessSubject = "Listing" | "Hours" | "Event";

type FreshnessTier = "fresh" | "recent" | "stale";

function tierFor(ageMs: number): FreshnessTier {
  const days = ageMs / 86_400_000;
  if (days < 14) return "fresh";
  return days < 90 ? "recent" : "stale";
}

export function freshnessLabel({
  iso,
  now,
  subject,
  basis = "checked",
}: {
  iso: string;
  now: number;
  subject: FreshnessSubject;
  /** "feed" for an automated calendar read; "checked" for a real check. */
  basis?: FreshnessBasis;
}): { tier: FreshnessTier; label: string } | null {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp) || timestamp > now) return null;
  const label = freshnessPhrase(subject, basis, iso, now);
  if (!label) return null;
  return { tier: tierFor(now - timestamp), label };
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
  basis = "checked",
  className = "",
}: {
  iso: string | undefined;
  subject?: FreshnessSubject;
  /** "feed" when the timestamp is an automated calendar read, so the chip
   *  never calls a feed fetch a check at the source. */
  basis?: FreshnessBasis;
  className?: string;
}) {
  // `now` is null on the server and the real clock on the client.
  // Using useSyncExternalStore keeps the SSR HTML free of any
  // time-dependent content — the chip materializes after hydration.
  const now = useSyncExternalStore(subscribeNoop, getClientNow, getServerNow);

  if (!iso) return null;
  if (now === null) return null; // SSR + pre-hydration: render nothing
  const freshness = freshnessLabel({ iso, now, subject, basis });
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
