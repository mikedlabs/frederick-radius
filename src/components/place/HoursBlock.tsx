"use client";

import { useEffect, useState } from "react";
import type { Hours } from "@/data/places";
import { formatFullHours, formatWindows, getOpenStatus, hoursForDate } from "@/lib/hours";
import { easternDayKey } from "@/lib/tz";
import { placeHoursTrust } from "@/lib/trust";
import TrustChip from "@/components/ui/TrustChip";
import { ChevronDown, AlertCircle } from "lucide-react";


export default function HoursBlock({
  hours,
  verified = false,
  provenance,
  website,
  phone,
}: {
  hours?: Hours;
  verified?: boolean;
  /** Hours source + freshness line (e.g. "Hours from Google, confirmed 3
   *  days ago."). Lives inside the expanded details so it stays honest
   *  without competing with the open/closed dot in the decision zone. */
  provenance?: string;
  website?: string;
  phone?: string;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!hours) return (
    <section aria-label="Hours" className="rounded-[var(--app-radius-md)] border p-3" style={{ borderColor: "var(--app-border)" }}>
      <p className="text-sm font-medium">Hours not recently confirmed</p>
      <p className="mt-1 text-xs" style={{ color: "var(--app-ink-2)" }}>Check with the business before going.</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {website && <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">Check the official website</a>}
        {phone && <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="inline-flex min-h-11 items-center underline">Call to check hours</a>}
      </div>
    </section>
  );
  const status = getOpenStatus(hours, { verified }, now);
  const today = hoursForDate(hours, now);
  const exception = hours._official?.exceptions.find((item) => item.date === easternDayKey(now));
  const week = formatFullHours(hours);

  return (
    <details
      className="group rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)" }}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2.5 list-none">
        <span className="flex min-w-0 items-center gap-2">
          {/* The SCHEDULE fact, not open/closed: the header's LiveOpenStatus
              is the page's one status voice, and this summary used to
              restate it (the duplicate the July 2026 review flagged). */}
          <span className="truncate text-sm font-medium" style={{ color: "var(--app-ink)" }}>
            Hours today · {today ? formatWindows(today) : "Hours not confirmed"}
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
        {(!verified || status.state === "unknown") && (
          <p
            className="mb-2 flex items-start gap-1.5 text-[11px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-warning)" }} />
            <span>
              These stored weekly hours are not current enough to confirm a visit. Check the official source before going.
            </span>
          </p>
        )}
        {hours._official && (
          <p className="mb-2 text-xs" style={{ color: "var(--app-ink-2)" }}>
            {hours._official.kind === "merchant"
              ? hours._official.schedule_kind === "dated_week"
                ? `The business published this schedule for ${hours._official.coverage_from} through ${hours._official.coverage_through}.`
                : "The table shows the business's posted weekly hours. Special-date changes may not be included. Check the official website before going."
              : <>{exception && today ? `${exception.reason}. ` : ""}The table shows normal weekly hours. Dated closures take priority.</>}
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
        {hours._official && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <a href={hours._official.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{hours._official.kind === "merchant" ? "Official business hours" : "Official branch hours"}</a>
            {hours._official.closures_url && <a href={hours._official.closures_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">FCPL holiday closures</a>}
          </p>
        )}
        {provenance && (
          <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {provenance}
          </p>
        )}
      </div>
    </details>
  );
}
