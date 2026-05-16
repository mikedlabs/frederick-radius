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

/**
 * One card per municipal event. If it recurs (Story Time every Friday),
 * the card shows "Every week · 11 more dates" and expands to list every
 * upcoming occurrence inline — the thing users kept asking for.
 */
export default function SeriesCard({ series }: { series: IngestedSeries }) {
  const [open, setOpen] = useState(false);
  const next = series.occurrences[0];
  const more = series.occurrences.slice(1);

  return (
    <article
      className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Date block */}
        <div
          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[var(--app-radius-md)] border"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
          aria-hidden
        >
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-brand)" }}>
            {eventDateParts(next.startsAtUtc).monthShort}
          </span>
          <span className="font-serif text-xl font-semibold leading-none" style={{ color: "var(--app-ink)" }}>
            {eventDateParts(next.startsAtUtc).day}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
            {series.title}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
            {fmtDate(next.startsAtUtc, next.allDay)}
            {series.venueName ? ` · ${series.venueName}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {series.category && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
              >
                {series.category}
              </span>
            )}
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
            >
              {series.municipality}
            </span>
            {series.isRecurring && (
              <button
                type="button"
                onClick={() => { haptic("light"); setOpen((v) => !v); }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--app-brand)1A", color: "var(--app-brand)" }}
                aria-expanded={open}
              >
                <Repeat className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                {more.length} more {more.length === 1 ? "date" : "dates"}
                <ChevronDown
                  className="h-3 w-3 transition-transform"
                  style={{ transform: open ? "rotate(180deg)" : "none" }}
                  aria-hidden
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded occurrence list */}
      {open && more.length > 0 && (
        <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
          {more.slice(0, 16).map((o) => (
            <li
              key={o.sourceUid}
              className="flex items-center justify-between gap-3 border-b px-4 py-2 last:border-b-0"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span className="text-xs" style={{ color: "var(--app-ink-2)" }}>
                {fmtDate(o.startsAtUtc, o.allDay)}
              </span>
              {o.sourceUrl && (
                <a
                  href={o.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: "var(--app-cool)" }}
                >
                  Details <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </li>
          ))}
          {more.length > 16 && (
            <li className="px-4 py-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              + {more.length - 16} more through {fmtDate(more[more.length - 1].startsAtUtc, true)}
            </li>
          )}
        </ul>
      )}

      {/* Footer actions */}
      <div
        className="flex items-center justify-between border-t px-4 py-2 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" aria-hidden /> {series.address ?? series.municipality}
        </span>
        {next.sourceUrl ? (
          <a
            href={next.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: "var(--app-brand)" }}
          >
            <CalendarPlus className="h-3 w-3" aria-hidden /> Event page
          </a>
        ) : null}
      </div>
    </article>
  );
}
