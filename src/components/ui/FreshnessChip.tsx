"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

/**
 * FreshnessChip — visible age signal for any timestamped row.
 *
 * Three states based on age:
 *   - Fresh (≤ 14d):   green check + "Confirmed · 3d ago"
 *   - Recent (≤ 90d):  neutral clock + "Confirmed Apr 18"
 *   - Stale (> 90d):   amber alert + "Last confirmed Mar 2026"
 *
 * Says "Confirmed", never "Verified". Per the trust vocabulary each
 * badge means exactly one thing: "Confirmed" = we spot-checked the
 * basics on this date; "Verified" is reserved for owner-managed
 * listings (which earn the stronger word). A freshness timestamp is a
 * confirmation date, not an owner endorsement, so it must not say
 * "Verified" — that was the badge-confusion the audit flagged.
 *
 * Honest by design: when the data is old, the chip says so — we'd
 * rather show the truth quietly than imply false freshness.
 */
function formatAge(ms: number): { tier: "fresh" | "recent" | "stale"; label: string } {
  const days = ms / 86_400_000;
  if (days < 1) {
    const hrs = Math.max(1, Math.round(ms / 3_600_000));
    return { tier: "fresh", label: `Confirmed · ${hrs}h ago` };
  }
  if (days < 14) {
    return { tier: "fresh", label: `Confirmed · ${Math.round(days)}d ago` };
  }
  return { tier: days < 90 ? "recent" : "stale", label: "" };
}

function formatAbsolute(d: Date, stale: boolean): string {
  const opts: Intl.DateTimeFormatOptions = stale
    ? { month: "short", year: "numeric" }
    : { month: "short", day: "numeric" };
  const prefix = stale ? "Last confirmed" : "Confirmed";
  return `${prefix} ${d.toLocaleDateString("en-US", opts)}`;
}

// No-op subscription: we just want a server/client split for `now`
// without polling. The chip's age is rendered once per mount; the
// label is stable enough that we don't need to tick.
const subscribeNoop = () => () => {};
const getClientNow = () => Date.now();
const getServerNow = () => null;

export default function FreshnessChip({
  iso,
  className = "",
}: {
  iso: string | undefined;
  className?: string;
}) {
  // `now` is null on the server and the real clock on the client.
  // Using useSyncExternalStore keeps the SSR HTML free of any
  // time-dependent content — the chip materializes after hydration.
  const now = useSyncExternalStore(subscribeNoop, getClientNow, getServerNow);

  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  if (now === null) return null; // SSR + pre-hydration: render nothing
  const ageMs = now - t;
  if (ageMs < 0) return null; // future-dated; treat as no signal
  const { tier, label } = formatAge(ageMs);
  const isStale = tier === "stale";
  const finalLabel = label || formatAbsolute(new Date(t), isStale);

  const palette =
    tier === "fresh"
      ? { color: "var(--app-positive)", Icon: CheckCircle2 }
      : tier === "recent"
      ? { color: "var(--app-ink-3)", Icon: Clock }
      : { color: "var(--app-warning)", Icon: AlertCircle };
  const { Icon } = palette;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${className}`}
      style={{ color: palette.color }}
      title={new Date(t).toLocaleString()}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
      {finalLabel}
    </span>
  );
}
