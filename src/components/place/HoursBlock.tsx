"use client";

import { useState } from "react";
import type { Hours } from "@/data/places";
import { formatFullHours, formatWindows, getOpenStatus } from "@/lib/hours";
import { easternParts } from "@/lib/tz";
import { placeHoursTrust } from "@/lib/trust";
import TrustChip from "@/components/ui/TrustChip";
import { ChevronDown, AlertCircle } from "lucide-react";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export default function HoursBlock({
  hours,
  verified = false,
  provenance,
}: {
  hours?: Hours;
  verified?: boolean;
  /** Hours source + freshness line (e.g. "Hours from Google, confirmed 3
   *  days ago."). Lives inside the expanded details so it stays honest
   *  without competing with the open/closed dot in the decision zone. */
  provenance?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!hours) return null;
  const status = getOpenStatus(hours, { verified });
  const week = formatFullHours(hours);

  return (
    <details
      className="group rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)" }}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 list-none">
        <span className="flex min-w-0 items-center gap-2">
          {/* The SCHEDULE fact, not open/closed: the header's LiveOpenStatus
              is the page's one status voice, and this summary used to
              restate it (the duplicate the July 2026 review flagged). */}
          <span className="truncate text-sm font-medium" style={{ color: "var(--app-ink)" }}>
            Hours today · {formatWindows(hours[DAY_KEYS[easternParts(new Date()).weekday]] ?? [])}
          </span>
          <TrustChip signal={placeHoursTrust(status)} className="shrink-0" />
        </span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 transition-transform"
          style={{
            color: "var(--app-ink-3)",
            transform: open ? "rotate(180deg)" : "rotate(0)",
          }}
        />
      </summary>
      <div className="px-3 pb-3 pt-1">
        {!verified && (
          <p
            className="mb-2 flex items-start gap-1.5 text-[11px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-warning)" }} />
            <span>
              Hours below are <strong>typical</strong> but not confirmed by the business. Always call ahead.
            </span>
          </p>
        )}
        <ul className="divide-y border-t text-sm" style={{ borderColor: "var(--app-border)" }}>
          {week.map((row) => (
            <li key={row.day} className="flex items-center justify-between py-1.5">
              <span style={{ color: "var(--app-ink-2)" }}>{row.label}</span>
              <span className="tabular-nums" style={{ color: "var(--app-ink)" }}>
                {formatWindows(row.windows)}
              </span>
            </li>
          ))}
        </ul>
        {provenance && (
          <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {provenance}
          </p>
        )}
      </div>
    </details>
  );
}
