"use client";

import { useEffect, useState } from "react";
import type { Hours } from "@/data/places";
import { formatFullHours, formatWindows, getOpenStatus, hoursForDate, isDisplayOnlyHours, isScheduleEvidenceCurrent } from "@/lib/hours";
import { easternDayKey } from "@/lib/tz";
import { placeHoursTrust } from "@/lib/trust";
import TrustChip from "@/components/ui/TrustChip";
import { ChevronDown, AlertCircle } from "lucide-react";


/**
 * The weekly schedule disclosure for a place that HAS hours. A place with no
 * schedule renders no hours block at all: its status line under the title
 * already states "Hours not recently confirmed" and the date the hours were
 * last checked, and the page's action bar carries Call and Website.
 */
export default function HoursBlock({
  hours,
  verified = false,
  provenance,
}: {
  hours: Hours;
  verified?: boolean;
  /** Hours source + freshness line (e.g. "Hours from Google, confirmed 3
   *  days ago."). Lives inside the expanded details so it stays honest
   *  without competing with the open/closed dot in the decision zone. */
  provenance?: string;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const status = getOpenStatus(hours, { verified }, now);
  const today = hoursForDate(hours, now);
  const exception = hours._official?.exceptions.find((item) => item.date === easternDayKey(now));
  const week = formatFullHours(hours);
  const qualification = isDisplayOnlyHours(hours) ? hours._official?.qualification : undefined;
  const scheduleCurrent = verified && isScheduleEvidenceCurrent(hours, now);
  const needsNewCheck = qualification ? !scheduleCurrent : (!verified || status.state === "unknown");

  const disclosure = (
    // PLAIN TOOL: an unboxed disclosure; the page's hairlines frame it.
    <details className="group/hours">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-[var(--app-radius-sm)] py-1 list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-focus)] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {/* The SCHEDULE fact, not open/closed: the header's LiveOpenStatus
              is the page's one status voice, and this summary used to
              restate it (the duplicate the July 2026 review flagged). */}
          <span className="text-[17px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {qualification ? `${qualification.label} today` : "Hours today"} · {today ? formatWindows(today) : "Hours not confirmed"}
          </span>
          <TrustChip signal={placeHoursTrust(status, { hours, verified, now })} className="shrink-0" />
        </span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 transition-transform group-open/hours:rotate-180 motion-reduce:transition-none"
          style={{
            color: "var(--app-ink-3)",
          }}
        />
      </summary>
      <div className="pt-2">
        {needsNewCheck && (
          <p
            className="mb-2 flex items-start gap-1.5 text-[11px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-warning)" }} />
            <span>
              {qualification
                ? "This posted schedule needs a new source check. Check the official source before going."
                : "These stored weekly hours are not current enough to confirm a visit. Check the official source before going."}
            </span>
          </p>
        )}
        {hours._official && (
          <p className="mb-2 text-xs" style={{ color: "var(--app-ink-2)" }}>
            {hours._official.kind === "merchant"
              ? hours._official.schedule_kind === "dated_week"
                ? `The business published this schedule for ${hours._official.coverage_from} through ${hours._official.coverage_through}.`
                : qualification
                  ? "Special-date changes may not be included in this posted schedule. Check the official website before going."
                : "The table shows the business's posted weekly hours. Special-date changes may not be included. Check the official website before going."
              : <>{exception && today ? `${exception.reason}. ` : ""}The table shows normal weekly hours. Dated closures take priority.</>}
          </p>
        )}
        <ul aria-label={qualification ? `${qualification.label} by day` : "Weekly hours"} className="divide-y divide-[var(--app-border)] border-t text-[15px]" style={{ borderColor: "var(--app-border)" }}>
          {week.map((row) => (
            <li key={row.day} className="flex items-center justify-between gap-3 py-2">
              <span style={{ color: "var(--app-ink-2)" }}>{row.label}</span>
              <span className="text-right tabular-nums" style={{ color: "var(--app-ink)" }}>
                {formatWindows(row.windows)}
              </span>
            </li>
          ))}
        </ul>
        {hours._official && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <a href={hours._official.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{qualification ? `Official ${qualification.label.toLowerCase()}` : hours._official.kind === "merchant" ? "Official business hours" : "Official branch hours"}</a>
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
  if (!qualification) return disclosure;
  return (
    <section aria-label={qualification.label} className="space-y-2">
      <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {!scheduleCurrent && <span className="font-medium">Previously posted: </span>}
        {qualification.note}
      </p>
      {disclosure}
    </section>
  );
}
