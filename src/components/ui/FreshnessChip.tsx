"use client";

import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

/**
 * FreshnessChip — visible age signal for any timestamped row.
 *
 * Three states based on age:
 *   - Fresh (≤ 14d):   green check + "Verified · 3d ago"
 *   - Recent (≤ 90d):  neutral clock + "Verified Apr 18"
 *   - Stale (> 90d):   amber alert + "Last verified Mar 2026"
 *
 * Honest by design: when the data is old, the chip says so — we'd
 * rather show the truth quietly than imply false freshness.
 */
function formatAge(ms: number): { tier: "fresh" | "recent" | "stale"; label: string } {
  const days = ms / 86_400_000;
  if (days < 1) {
    const hrs = Math.max(1, Math.round(ms / 3_600_000));
    return { tier: "fresh", label: `Verified · ${hrs}h ago` };
  }
  if (days < 14) {
    return { tier: "fresh", label: `Verified · ${Math.round(days)}d ago` };
  }
  return { tier: days < 90 ? "recent" : "stale", label: "" };
}

function formatAbsolute(d: Date, stale: boolean): string {
  const opts: Intl.DateTimeFormatOptions = stale
    ? { month: "short", year: "numeric" }
    : { month: "short", day: "numeric" };
  const prefix = stale ? "Last verified" : "Verified";
  return `${prefix} ${d.toLocaleDateString("en-US", opts)}`;
}

export default function FreshnessChip({
  iso,
  className = "",
}: {
  iso: string | undefined;
  className?: string;
}) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const ageMs = Date.now() - t;
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
