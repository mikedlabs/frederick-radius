import { CarFront, TrainFront } from "lucide-react";
import { PARKING_GARAGES } from "@/data/parking-garages";
import { MARC_STATIONS } from "@/data/marc-stations";
import { fieldNotesFor } from "@/lib/loaders/fieldNotes";
import { haversineMeters, formatDistance, metersToMinutes } from "@/lib/geo";
import Link from "next/link";

/**
 * GettingThere — the logistics stanza on an event page, assembled entirely
 * from data already in the repo (experience review, differentiators #4:
 * "the visitor-acquisition moment from NORTH_STAR answered in one move").
 *
 * Three quiet lines, each rendered only when EARNED by the data:
 *   1. The venue's VERIFIED Field-Notes parking line (via venue_place_slug) —
 *      the moat: "park in the lower lot, the front spots fill first."
 *   2. Else, for events with precise geo near downtown: the nearest city
 *      garage with walk time ($1/hr city schedule).
 *   3. A MARC station within a 12-minute walk (~1km), with walk minutes —
 *      Frederick/Monocacy/Brunswick/Point of Rocks events read as train-
 *      reachable to DC-area visitors.
 *
 * Server component; pure data joins, no fetches. Renders nothing when no
 * line is earned, so most county events are untouched.
 */
export default function GettingThere({
  geom,
  venuePlaceSlug,
  geoPrecise,
}: {
  geom: { lng: number; lat: number };
  venuePlaceSlug?: string;
  geoPrecise: boolean;
}) {
  // 1. Verified parking intel for the venue itself.
  const parkingNote = venuePlaceSlug ? fieldNotesFor(venuePlaceSlug)?.parking?.text : undefined;

  // 2. Nearest city garage — only for precisely-located events within a
  //    downtown-ish walk (1.1km) of one, so a Thurmont carnival never gets
  //    urged into a Frederick garage.
  let garageLine: string | null = null;
  if (!parkingNote && geoPrecise) {
    let best: { name: string; m: number } | null = null;
    for (const g of PARKING_GARAGES) {
      if (!g.geom) continue;
      const m = haversineMeters(geom, g.geom);
      if (m <= 1100 && (!best || m < best.m)) best = { name: g.name, m };
    }
    if (best) {
      const min = Math.max(1, Math.round(metersToMinutes("walk", best.m)));
      garageLine = `${best.name} garage is a ${min} min walk (${formatDistance(best.m)}) · $1/hr, $5 max evenings`;
    }
  }

  // 3. MARC within a ~12 minute walk.
  let marcLine: string | null = null;
  if (geoPrecise) {
    let best: { name: string; m: number } | null = null;
    for (const s of MARC_STATIONS) {
      const m = haversineMeters(geom, { lng: s.lng, lat: s.lat });
      if (m <= 1000 && (!best || m < best.m)) best = { name: s.name, m };
    }
    if (best) {
      const min = Math.max(1, Math.round(metersToMinutes("walk", best.m)));
      marcLine = `${best.name} MARC station is a ${min} min walk`;
    }
  }

  if (!parkingNote && !garageLine && !marcLine) return null;

  return (
    <section
      aria-label="Getting there"
      className="rounded-[var(--app-radius-md)] border p-3.5"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Getting there
      </p>
      <ul className="mt-2 space-y-1.5">
        {parkingNote && (
          <li className="flex items-start gap-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            <CarFront className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-brand-2)" }} aria-hidden />
            <span>
              {parkingNote}
              <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-brand-2)" }}>
                Verified
              </span>
            </span>
          </li>
        )}
        {garageLine && (
          <li className="flex items-start gap-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            <CarFront className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-cool)" }} aria-hidden />
            <span>
              {garageLine} ·{" "}
              <Link href="/parking" className="font-semibold underline" style={{ color: "var(--app-cool)" }}>
                all garages
              </Link>
            </span>
          </li>
        )}
        {marcLine && (
          <li className="flex items-start gap-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            <TrainFront className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-cool)" }} aria-hidden />
            <span>
              {marcLine} ·{" "}
              <Link href="/transit" className="font-semibold underline" style={{ color: "var(--app-cool)" }}>
                schedules
              </Link>
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
