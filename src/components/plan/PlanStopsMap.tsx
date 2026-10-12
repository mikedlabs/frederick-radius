"use client";

import { Component, lazy, Suspense, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, MapPin } from "lucide-react";
import type { Plan } from "@/lib/integrations/planner";
import type { EventPin, MapPinPlace } from "@/components/map/types";
import { withBrowseReturnTo } from "@/lib/browse-return";

// No map module, map instance, or provider request before the visitor expands
// this view. The shared map shell retains its existing budget and recovery path.
const StopsMap = lazy(() => import("@/components/map/AppMapClient"));

type LocatedStop = {
  stop: Plan["stops"][number];
  geom: { lng: number; lat: number };
};

function locatedStops(plan: Plan): LocatedStop[] {
  return plan.stops.flatMap((stop) => {
    const geom = stop.place?.geom ?? stop.event?.geom;
    return geom && Number.isFinite(geom.lng) && Number.isFinite(geom.lat)
      && geom.lng >= -180 && geom.lng <= 180 && geom.lat >= -90 && geom.lat <= 90
      ? [{ stop, geom }] : [];
  });
}

function boundsFor(stops: LocatedStop[]): [[number, number], [number, number]] {
  const lngs = stops.map(({ geom }) => geom.lng);
  const lats = stops.map(({ geom }) => geom.lat);
  // A small real-coordinate margin also makes a one-stop extent usable.
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const lngPad = Math.max(0.002, (east - west) * 0.12);
  const latPad = Math.max(0.002, (north - south) * 0.12);
  return [[west - lngPad, south - latPad], [east + lngPad, north + latPad]];
}

class StopsMapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <p role="status" className="px-4 py-6 text-sm leading-relaxed text-[var(--app-ink-2)]">
        The map could not load. Your stops and their detail links are still here.
      </p>
    ) : this.props.children;
  }
}

export default function PlanStopsMap({ plan, returnTo, disabled = false }: { plan: Plan; returnTo?: string; disabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const viewId = useId();
  const stops = locatedStops(plan);
  if (stops.length === 0) return null;

  const places: MapPinPlace[] = stops.flatMap(({ stop }) => stop.place ? [{
    slug: stop.place.slug,
    name: stop.place.name,
    category: stop.place.category,
    subcategories: stop.place.subcategories,
    geom: stop.place.geom,
    // A scheduled stop's hours must never become an "Open now" map claim.
    open_status: { state: "unknown" as const },
    is_verified: stop.place.is_verified,
    source: stop.place.source,
    municipality: stop.place.municipality,
    short_blurb: stop.place.short_blurb,
    primary_type: undefined,
    field_notes: undefined,
  }] : []);
  const events: EventPin[] = stops.flatMap(({ stop, geom }) => stop.event ? [{
    slug: stop.event.slug,
    title: stop.event.title,
    starts_at: stop.event.starts_at,
    ends_at: stop.event.ends_at,
    venue_name: stop.event.venue_name,
    venue_place_slug: stop.event.venue_place_slug,
    lng: geom.lng,
    lat: geom.lat,
    category: stop.event.category,
  }] : []);
  const extentKey = stops.map(({ stop, geom }) => `${stop.place?.slug ?? stop.event?.slug}:${geom.lng}:${geom.lat}`).join("|");

  return (
    <section aria-label="Stops on the map" className="overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-bg-elevated)]">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={viewId}
        disabled={disabled}
        onClick={() => setExpanded((current) => !current)}
        className="disabled:opacity-50 flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-[14px] font-semibold text-[var(--app-ink)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-brand)]"
      >
        <MapPin className="h-4 w-4 text-[var(--app-brand)]" aria-hidden />
        <span className="flex-1">{expanded ? "Hide stops map" : "Show stops on map"}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div id={viewId} hidden={!expanded}>
        {expanded && <>
          <p className="border-t border-[var(--app-border)] px-4 py-3 text-[13px] leading-relaxed text-[var(--app-ink-2)]">
            See where your stops are. Use Open full route for directions between them.
          </p>
          <div className="relative h-[clamp(300px,48svh,420px)] overflow-hidden" role="region" aria-label="Map of planned stop locations">
            <StopsMapBoundary key={extentKey}>
              <Suspense fallback={<p role="status" className="p-4 text-sm text-[var(--app-ink-2)]">Loading your stops map…</p>}>
                <StopsMap
                  key={extentKey}
                  places={places}
                  events={events}
                  fullBleed
                  compactSubjectMap
                  showSearchControls={false}
                  recenterToKnownLocation={false}
                  initialBounds={boundsFor(stops)}
                  initialBoundsPadding={{ top: 32, right: 24, bottom: 80, left: 24 }}
                  cameraMinZoom={8.25}
                />
              </Suspense>
            </StopsMapBoundary>
          </div>
          <ol aria-label="Stops shown on the map" className="border-t border-[var(--app-border)] px-4 py-2">
            {stops.map(({ stop }) => {
              const href = stop.place ? `/places/${stop.place.slug}` : `/events/${stop.event!.slug}`;
              const name = stop.place?.name ?? stop.event!.title;
              return <li key={`${stop.order}:${href}`}>
                <Link href={withBrowseReturnTo(href, returnTo)} className="flex min-h-11 items-center gap-3 py-2 text-[13px] font-medium text-[var(--app-ink)] underline decoration-[var(--app-border-strong)] underline-offset-4">
                  <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--app-bg-sunken)] text-[var(--app-ink-2)]">{stop.order}</span>
                  {name}
                </Link>
              </li>;
            })}
          </ol>
        </>}
      </div>
    </section>
  );
}
