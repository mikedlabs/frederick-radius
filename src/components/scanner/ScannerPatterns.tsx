import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ScannerPatterns as Patterns, SpotCount } from "@/lib/scanner/scannerPatterns";

/**
 * ScannerPatterns — the memory of the wire. Where crashes cluster, where wires
 * come down, and when crashes peak, aggregated from the public feed's rolling
 * window. Server-rendered from cached data; renders nothing until there's a
 * window worth summarizing. Aggregate and block-level only — the same public
 * calls as the live board, counted instead of listed.
 */

function to12h(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour} ${period}`;
}

function SpotName({ spot }: { spot: SpotCount }) {
  if (spot.lat === undefined || spot.lng === undefined) {
    return (
      <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--app-ink)" }}>
        {spot.spot}
      </span>
    );
  }
  // Placeable spot → tap to open the map right on it (?at=lat,lng).
  return (
    <Link
      href={`/map?at=${spot.lat.toFixed(5)},${spot.lng.toFixed(5)}`}
      className="tap-44 group flex min-w-0 flex-1 items-center gap-1.5 text-[13px]"
      style={{ color: "var(--app-ink)" }}
    >
      <span className="truncate underline-offset-2 group-hover:underline">{spot.spot}</span>
      <MapPin className="h-3 w-3 shrink-0 opacity-40 transition group-hover:opacity-80" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}

function SpotList({ spots, unit }: { spots: SpotCount[]; unit: string }) {
  const max = Math.max(...spots.map((s) => s.count), 1);
  return (
    <ul className="space-y-1.5">
      {spots.map((s) => (
        <li key={s.spot} className="flex items-center gap-3">
          <SpotName spot={s} />
          <span
            aria-hidden
            className="hidden h-1.5 rounded-full sm:block"
            style={{ width: `${Math.round((s.count / max) * 72)}px`, background: "var(--app-brand-tint-2, var(--app-brand))", opacity: 0.55 }}
          />
          <span
            className="shrink-0 font-mono text-[12px] tabular-nums"
            style={{ color: "var(--app-ink-2)" }}
          >
            {s.count} {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HourStrip({ byHour, peakHour }: { byHour: number[]; peakHour: number }) {
  const max = Math.max(...byHour, 1);
  return (
    <div>
      <div
        className="flex h-16 items-end gap-[3px]"
        role="img"
        aria-label={`Crashes by hour of day; busiest around ${to12h(peakHour)}.`}
      >
        {byHour.map((c, h) => (
          <span
            key={h}
            className="flex-1 rounded-t-[2px]"
            style={{
              height: `${Math.max(6, Math.round((c / max) * 100))}%`,
              background: h === peakHour ? "var(--app-brand)" : "var(--app-ink-tint-2, var(--app-ink))",
              opacity: h === peakHour ? 1 : 0.22,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9.5px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>11p</span>
      </div>
    </div>
  );
}

function formatK(n: number): string {
  return n < 10000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`;
}

const WEEKDAY_FULL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

export default function ScannerPatterns({ patterns }: { patterns: Patterns }) {
  // Defaults guard against an older-shaped object served from the cache during
  // a revalidation window (the cache key is bumped on shape changes, but this
  // keeps the page from ever crashing if a stale entry sneaks through).
  const {
    days,
    total,
    crashSpots = [],
    wireSpots = [],
    byHour = [],
    peakHour = null,
    peakWeekday = null,
    trafficAdjusted = [],
  } = patterns;
  if (total === 0 || days === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-serif text-[20px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          The pattern
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Across {days} {days === 1 ? "day" : "days"} of dispatches, {total} public calls came
          across the wire. Here is where they land and when.
        </p>
      </div>

      {crashSpots.length > 0 && (
        <div
          className="rounded-[var(--app-radius-md)] border p-3.5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="mb-2 flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
            <span>Where crashes cluster</span>
            {crashSpots.some((s) => s.lat !== undefined) && (
              <span style={{ color: "var(--app-ink-3)", fontWeight: 400, textTransform: "none" }}>Tap to map</span>
            )}
          </p>
          <SpotList spots={crashSpots} unit="crashes" />
        </div>
      )}

      {trafficAdjusted.length > 0 && (
        <div
          className="rounded-[var(--app-radius-md)] border p-3.5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
            Most crashes per vehicle
          </p>
          <p className="mb-2 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            A busy road with many crashes is expected. Set against how many
            vehicles use it, these roads see the most crashes for their traffic.
          </p>
          <ul className="space-y-1.5">
            {trafficAdjusted.map((r) => (
              <li key={r.spot} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--app-ink)" }}>
                  {r.spot}
                </span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                  {r.count} / ~{formatK(r.aadt)} a day
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            Daily traffic from Frederick County counts, most recent available.
            Only roads the county has counted appear here.
          </p>
        </div>
      )}

      {peakHour !== null && byHour.some((c) => c > 0) && (
        <div
          className="rounded-[var(--app-radius-md)] border p-3.5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="mb-2 flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
            <span>When crashes happen</span>
            <span style={{ color: "var(--app-brand-press)" }}>
              Busiest around {to12h(peakHour)}{peakWeekday !== null ? `, ${WEEKDAY_FULL[peakWeekday]}` : ""}
            </span>
          </p>
          <HourStrip byHour={byHour} peakHour={peakHour} />
        </div>
      )}

      {wireSpots.length > 0 && (
        <div
          className="rounded-[var(--app-radius-md)] border p-3.5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
            Where wires come down
          </p>
          <SpotList spots={wireSpots} unit="times" />
        </div>
      )}

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Counted from public dispatch calls over a rolling window, grouped by road.
        Preliminary and block-level, a picture of the pattern rather than an exact
        tally.
      </p>
    </section>
  );
}
