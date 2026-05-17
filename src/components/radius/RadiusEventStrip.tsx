"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { EventWithMeta } from "@/lib/loaders/events";
import { haversineMeters, minutesToMeters } from "@/lib/geo";
import { eventDateBlock } from "@/lib/loaders/events";
import { useRadius } from "@/components/radius/RadiusContext";

/**
 * A horizontal events strip that filters to the LIVE radius. The server
 * passes events already narrowed to a time window and to trustworthy
 * sources; this only does the distance test against the shared radius
 * center, which is pure lat/lng math (timezone-independent, so no
 * hydration divergence). Moving the radius re-filters every strip.
 */
export default function RadiusEventStrip({
  title,
  events,
  emptyText,
  seeAllHref = "/events",
}: {
  title: string;
  events: EventWithMeta[];
  emptyText: string;
  seeAllHref?: string;
}) {
  const { center, mode, minutes } = useRadius();

  const within = useMemo(() => {
    const meters = minutesToMeters(mode, minutes);
    return events
      .map((e) => ({ e, d: haversineMeters({ lng: center.lng, lat: center.lat }, e.geom) }))
      .filter((x) => x.d <= meters)
      .sort((a, b) => +new Date(a.e.starts_at) - +new Date(b.e.starts_at))
      .map((x) => x.e);
  }, [events, center.lng, center.lat, mode, minutes]);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          {title}
          {within.length > 0 && (
            <span className="ml-2 text-sm font-normal" style={{ color: "var(--app-ink-3)" }}>
              {within.length} in your radius
            </span>
          )}
        </h2>
        <Link
          href={seeAllHref}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
          style={{ color: "var(--app-brand)" }}
        >
          See all <ArrowRight className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </Link>
      </div>

      {within.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          {emptyText}
        </p>
      ) : (
        <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
          {within.slice(0, 12).map((e) => {
            const d = eventDateBlock(e);
            return (
              <li key={e.slug} className="shrink-0">
                <Link
                  href={`/events/${e.slug}`}
                  className="flex h-full w-56 flex-col gap-2 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)] transition hover:shadow-[var(--app-shadow-2)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <span
                    className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
                  >
                    {d.month} {d.day} · {d.time}
                  </span>
                  <span
                    className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {e.title}
                  </span>
                  <span className="mt-auto truncate text-xs" style={{ color: "var(--app-ink-3)" }}>
                    {e.venue_name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
