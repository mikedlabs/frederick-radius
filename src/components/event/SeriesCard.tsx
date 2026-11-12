"use client";

import { useState } from "react";
import { Repeat, ChevronDown, MapPin, ExternalLink, CalendarPlus } from "lucide-react";
import { haptic } from "@/lib/haptics";
import type { IngestedSeries } from "@/lib/loaders/ingested";
import { formatEventDate, formatEventTime, eventDateParts } from "@/lib/format/eventTime";

function fmtDate(iso: string, allDay: boolean): string {
  return allDay
    ? formatEventDate(iso)
    : `${formatEventDate(iso)}, ${formatEventTime(iso)}`;
}

/** Caption when the date column on the left already shows the date:
 *  we only need the time and venue, not the full date again. */
function fmtTimeOnly(iso: string, allDay: boolean): string {
  return allDay ? "All day" : formatEventTime(iso);
}

/**
 * One row per municipal event, on the white ground between hairlines. If it
 * recurs (Story Time every Friday), the row offers "11 more dates" and
 * expands to list every upcoming occurrence inline.
 */
export default function SeriesCard({ series }: { series: IngestedSeries }) {
  const [open, setOpen] = useState(false);
  const next = series.occurrences[0];
  const more = series.occurrences.slice(1);
  const nextDate = eventDateParts(next.startsAtUtc);
  // Category and town are informational, so they read as one plain line.
  const tags = [series.category, series.municipality].filter(Boolean).join(" · ");

  return (
    <article className="border-b py-4" style={{ borderColor: "var(--app-border)" }}>
      <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-4">
        <p
          className="text-[11px] font-semibold uppercase leading-snug tracking-[0.04em] tabular-nums"
          style={{ color: "var(--app-ink-2)" }}
        >
          <span className="block">{nextDate.weekdayShort}</span>
          <span className="block">{nextDate.monthShort} {nextDate.day}</span>
        </p>

        <div className="min-w-0">
          {series.presenter && (
            <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>
              {series.presenter}
            </p>
          )}
          <h3 className="text-[17px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
            {series.title}
          </h3>
          <p className="mt-1 text-[14px]" style={{ color: "var(--app-ink-2)" }}>
            {fmtTimeOnly(next.startsAtUtc, next.allDay)}
            {series.venueName ? ` · ${series.venueName}` : ""}
          </p>
          {tags && (
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              {tags}
            </p>
          )}
          {series.isRecurring && (
            <button
              type="button"
              onClick={() => { haptic("light"); setOpen((v) => !v); }}
              className="tap-44-y inline-flex items-center gap-1 text-[13px] font-semibold"
              style={{ color: "var(--app-link)" }}
              aria-expanded={open}
            >
              <Repeat className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {more.length} more {more.length === 1 ? "date" : "dates"}
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform"
                style={{ transform: open ? "rotate(180deg)" : "none" }}
                aria-hidden
              />
            </button>
          )}

          {/* Expanded occurrence list */}
          {open && more.length > 0 && (
            <ul className="mt-1 border-t" style={{ borderColor: "var(--app-border)" }}>
              {more.slice(0, 16).map((o) => (
                <li
                  key={o.sourceUid}
                  className="flex items-center justify-between gap-3 border-b last:border-b-0"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <span className="text-[13px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                    {fmtDate(o.startsAtUtc, o.allDay)}
                  </span>
                  {o.sourceUrl && (
                    <a
                      href={o.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium underline underline-offset-2"
                      style={{ color: "var(--app-cool-text)" }}
                    >
                      Details <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </li>
              ))}
              {more.length > 16 && (
                <li className="py-2 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                  + {more.length - 16} more through {fmtDate(more[more.length - 1].startsAtUtc, true)}
                </li>
              )}
            </ul>
          )}

          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> {series.address ?? series.municipality}
            </span>
            {next.sourceUrl ? (
              <a
                href={next.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold underline underline-offset-2"
                style={{ color: "var(--app-link)" }}
              >
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Event page
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
