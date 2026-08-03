import type { Metadata } from "next";
import Link from "next/link";
import {
  Bus,
  ExternalLink,
  MapPin,
  Clock,
  TrainFront,
  Accessibility,
  Bike,
  Users,
  Search,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

const COUNTY_TRANSIT_URL = "https://frederickcountymd.gov/105/Transit-Services";
const COUNTY_TRANSIT_SCHEDULES_URL =
  "https://www.frederickcountymd.gov/207/Transit-Routes-Schedule-Information";
const COUNTY_TRANSIT_PHONE = "301-600-2065";

// Intent-led entry tiles, split by what the rider is doing. "Act now" are the
// planning exits a rider reaches for before a trip; "reference" are the rider
// services people look up occasionally (fares, paratransit, lost items). The
// live dashboard above answers "what can I catch right now"; these answer the
// slower questions, and the reference set collapses so it never competes.
type TransitIntent = {
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  href: string;
  external?: boolean;
};

const TRANSIT_ACT: TransitIntent[] = [
  {
    label: "Bus schedules",
    hint: "Official connector and shuttle schedules, including July 2026 changes",
    icon: Clock,
    accent: "var(--app-cool)",
    href: COUNTY_TRANSIT_SCHEDULES_URL,
    external: true,
  },
  {
    label: "MARC to DC",
    hint: "Brunswick line: Brunswick + Point of Rocks to Silver Spring + DC",
    icon: TrainFront,
    accent: "var(--app-accent)",
    href: "https://www.mta.maryland.gov/schedule/marc-brunswick",
    external: true,
  },
];

const TRANSIT_REFERENCE: TransitIntent[] = [
  {
    label: "TransIT-plus (paratransit)",
    hint: "Door-to-door rides for disabled riders, book 1+ business days ahead",
    icon: Accessibility,
    accent: "var(--app-positive)",
    href: "https://frederickcountymd.gov/108/TransIT-Plus",
    external: true,
  },
  {
    label: "Accessibility + communication",
    hint: "Maryland Relay 711, driver assistance, lifts, ramps, and travel training",
    icon: Accessibility,
    accent: "var(--app-cool)",
    href: "https://frederickcountymd.gov/222/Accessibility-Features",
    external: true,
  },
  {
    label: "Bike on the bus",
    hint: "TransIT buses have bike racks; the driver can help if needed",
    icon: Bike,
    accent: "var(--app-cool)",
    href: COUNTY_TRANSIT_URL,
    external: true,
  },
  {
    label: "Service updates",
    hint: "Official route changes, cancellations, and holiday service",
    icon: Users,
    accent: "var(--app-warning)",
    href: "https://frederickcountymd.gov/225/Rider-Bulletins-News-Updates-Publication",
    external: true,
  },
  {
    label: "Lost something on the bus",
    hint: `Call TransIT: ${COUNTY_TRANSIT_PHONE}`,
    icon: Search,
    accent: "var(--app-ink-2)",
    href: `tel:${COUNTY_TRANSIT_PHONE.replace(/[^0-9]/g, "")}`,
  },
];
import {
  getFrederickTransitRoutes,
  getFrederickTransitRouteShapes,
  getTransitFreshness,
  type LineFC,
} from "@/lib/integrations/transitFrederick";
import { getMarcBoard, getMarcAlerts } from "@/lib/integrations/marcTrains";
import TransitMap from "@/components/transit/TransitMapClient";
import TransitNow from "@/components/transit/TransitNow";
import NextTrainBoard from "@/components/transit/NextTrainBoard";
import NextStopsBoard from "@/components/transit/NextStopsBoard";
import RoutePearls from "@/components/transit/RoutePearls";
import TransitRouteFinder from "@/components/transit/TransitRouteFinder";
import TransitStopFinder from "@/components/transit/TransitStopFinder";
import TransitServiceAlerts from "@/components/transit/TransitServiceAlerts";
import PageBloom from "@/components/ui/PageBloom";
import TRANSIT_RAW from "@/data/transit.json" with { type: "json" };
import TRANSIT_NETWORK from "@/data/transit-network.json" with { type: "json" };
import { CURRENT_TRANSIT_STOP_COUNT } from "@/lib/transit-static";

export const metadata: Metadata = {
  alternates: { canonical: "/transit" },
  title: "Transit",
  description:
    "Live Frederick County TransIT arrivals, route maps, and MARC departures.",
};

// 60s so the live MARC next-train board and the schedule-derived hero
// countdown stay fresh; the route + shape loaders keep their own weekly fetch
// cache, and the MARC realtime fetch carries its own 30s cache.
export const revalidate = 60;

/**
 * /transit — a map-led transit dashboard.
 *
 * The page answers the rider's stop-level decision before any network-wide
 * reference: where is my stop, what is inbound, and do I have enough time to
 * walk there. Order: rider command center, network status, live map, expandable
 * system-wide boards, then planning and reference tools.
 *
 * Live data that exists today: TransIT vehicle positions with a resolved next
 * stop + ETA (GTFS-realtime), MARC schedule with a realtime delay overlay, and
 * per-stop bus arrivals (GTFS-realtime TripUpdates, surfaced on stop tap).
 * TransIT also publishes official schedules and a static GTFS feed. Radius uses
 * that static feed for the network snapshot, but does not present it as live.
 */
function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (days < 0) return null;
  if (days < 1) return "today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  if (days < 365) return "12 months ago";
  const years = Math.max(1, Math.floor(days / 365));
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function sourceDate(iso: string | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** The official static GTFS snapshot is the canonical network on this page.
 * Maryland Open Data remains a fail-soft fallback and a freshness comparison,
 * but it can lag behind newly published routes. GTFS points are [lat, lng];
 * GeoJSON coordinates are [lng, lat]. */
function staticTransitShapes(): LineFC {
  const data = TRANSIT_RAW as {
    routes: Array<{ id: string; short: string; name: string }>;
    shapes?: Record<string, number[][]>;
  };
  const network = TRANSIT_NETWORK as {
    shapeVariants?: Record<
      string,
      Array<{
        id: string;
        directionIds: number[];
        headsigns: string[];
        points: number[][];
      }>
    >;
  };
  const routeById = new Map(data.routes.map((route) => [route.id, route]));
  const publishedShapes =
    network.shapeVariants && Object.keys(network.shapeVariants).length > 0
      ? Object.entries(network.shapeVariants).flatMap(([routeId, variants]) =>
          variants.map((variant) => ({
            routeId,
            variantId: variant.id,
            directionIds: variant.directionIds,
            headsigns: variant.headsigns,
            points: variant.points,
          })),
        )
      : Object.entries(data.shapes ?? {}).map(([routeId, points]) => ({
          routeId,
          variantId: routeId,
          directionIds: [] as number[],
          headsigns: [] as string[],
          points,
        }));
  return {
    type: "FeatureCollection",
    features: publishedShapes.flatMap(
      ({ routeId, variantId, directionIds, headsigns, points }) => {
        const coordinates = points
          .filter(
            (point) =>
              point.length >= 2 &&
              Number.isFinite(point[0]) &&
              Number.isFinite(point[1]),
          )
          .map(([lat, lng]) => [lng, lat]);
        if (coordinates.length < 2) return [];
        const route = routeById.get(routeId);
        return [
          {
            type: "Feature" as const,
            geometry: { type: "LineString", coordinates },
            properties: {
              routeId,
              name: route?.name ?? "TransIT route",
              short: route?.short ?? "",
              variantId,
              directionIds: directionIds.join(","),
              headsigns: headsigns.join(" · "),
              source: "Official TransIT GTFS",
            },
          },
        ];
      },
    ),
  };
}

function IntentTile({ intent, layout = "rail" }: { intent: TransitIntent; layout?: "rail" | "grid" }) {
  const Icon = intent.icon;
  return (
    <li className={layout === "grid" ? "min-w-0" : "w-[10rem] shrink-0 snap-start sm:w-auto"}>
      <a
        href={intent.href}
        target={intent.external ? "_blank" : undefined}
        rel={intent.external ? "noopener noreferrer" : undefined}
        className="hover-lift flex h-full flex-col items-start gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: `color-mix(in srgb, ${intent.accent} 14%, transparent)` }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} style={{ color: intent.accent }} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            {intent.label}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            {intent.hint}
          </span>
        </span>
      </a>
    </li>
  );
}

export default async function TransitPage() {
  const canonicalShapes = staticTransitShapes();
  // All network fetches run in parallel; each revalidates on its own schedule.
  // The committed official GTFS network avoids a cold Maryland Open Data call.
  // The latter remains a fail-soft fallback if a future build lacks shapes.
  const [shapes, routes, freshness, board, alerts] = await Promise.all([
    canonicalShapes.features.length > 0
      ? Promise.resolve(canonicalShapes)
      : getFrederickTransitRouteShapes(),
    getFrederickTransitRoutes(),
    getTransitFreshness(),
    getMarcBoard(new Date()),
    getMarcAlerts(),
  ]);
  const routesAge = relativeAge(freshness.routesUpdatedAt);

  // Group routes by name so variations of one route collapse to one entry in
  // the finder. Variations stay distinct on the map.
  const byName = new Map<string, typeof routes>();
  for (const r of routes) {
    const arr = byName.get(r.name) ?? [];
    arr.push(r);
    byName.set(r.name, arr);
  }
  const grouped = Array.from(byName.entries())
    .map(([name, variations]) => ({ name, variations }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const staticRoutes = (
    TRANSIT_RAW as {
      routes: Array<{ id: string; short: string; name: string }>;
    }
  ).routes;

  const fareFree = (TRANSIT_RAW as { fareFree?: boolean }).fareFree === true;
  const staticFeed = (
    TRANSIT_RAW as {
      generatedAt?: string;
      staticFeed?: {
        fetchedOn?: string;
        serviceWindowStart?: string;
        serviceWindowEnd?: string;
      };
    }
  ).staticFeed;
  const staticSnapshotDate = sourceDate(staticFeed?.fetchedOn);
  const serviceWindowStart = sourceDate(staticFeed?.serviceWindowStart);
  const serviceWindowEnd = sourceDate(staticFeed?.serviceWindowEnd);
  const networkPatternCount = shapes.features.length;
  const staticStopCount = CURRENT_TRANSIT_STOP_COUNT;

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />

      <header className="space-y-1.5">
        <p className="eyebrow inline-flex items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
          <Bus className="h-3 w-3" strokeWidth={2.25} style={{ color: "var(--app-cool)" }} aria-hidden />
          Frederick County
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Transit
        </h1>
        <p className="max-w-[38rem] text-[14px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          Find your stop, see the next buses, and know when to start walking. MARC departures are here too.
        </p>
      </header>

      {/* The primary rider decision: choose a stop, compare the walk with live
          arrivals, and keep frequently used stops one tap away. */}
      <TransitStopFinder />

      <TransitServiceAlerts />

      {/* Network-wide context follows the rider's own stop decision. */}
      <TransitNow board={board} />

      <a
        href="https://frederickcountymd.gov/222/Accessibility-Features"
        target="_blank"
        rel="noopener noreferrer"
        className="tap-44-y flex items-center gap-2.5 rounded-[var(--app-radius-md)] border px-3 py-2.5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-2)",
        }}
      >
        <Accessibility
          className="h-4 w-4 shrink-0"
          strokeWidth={2.1}
          style={{ color: "var(--app-cool)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-[12px] leading-snug">
          Deaf and hard-of-hearing riders: Maryland Relay 711 and TransIT
          accessibility help.
        </span>
        <ExternalLink
          className="h-3.5 w-3.5 shrink-0"
          strokeWidth={2}
          aria-hidden
        />
      </a>

      <section aria-labelledby="live-network-heading" className="space-y-2.5">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <h2
              id="live-network-heading"
              className="text-[18px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              Live network
            </h2>
            <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              Follow buses on the map, tap another stop, or frame a route.
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold" style={{ color: "var(--app-cool)" }}>
            Buses + MARC
          </span>
        </div>
        <p
          className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] font-medium"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span>Official TransIT network</span>
          <span aria-hidden>·</span>
          <span>{networkPatternCount} published route patterns</span>
          {staticStopCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{staticStopCount} stops</span>
            </>
          )}
        </p>
        <TransitMap
          shapes={shapes}
          height="clamp(20rem, 44svh, 26rem)"
          liveBuses
          highlightRoutes
          interactiveStops
          hideBadge
        />
      </section>

      <div className="space-y-2">
        <details
          className="group rounded-[var(--app-radius-md)] border"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <summary className="tap-44-y flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
            <span>
              <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                All buses reporting now
              </span>
              <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                Next reported stop and arrival time
              </span>
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 transition group-open:rotate-180"
              strokeWidth={2.25}
              aria-hidden
              style={{ color: "var(--app-ink-3)" }}
            />
          </summary>
          <div className="px-3 pb-3 pt-1">
            <NextStopsBoard />
          </div>
        </details>

        <details
          className="group rounded-[var(--app-radius-md)] border"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <summary className="tap-44-y flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
            <span>
              <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                All MARC stations
              </span>
              <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                Frederick County departures in both directions
              </span>
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 transition group-open:rotate-180"
              strokeWidth={2.25}
              aria-hidden
              style={{ color: "var(--app-ink-3)" }}
            />
          </summary>
          <div className="px-3 pb-3 pt-1">
            <NextTrainBoard board={board} alerts={alerts} />
          </div>
        </details>
      </div>

      {/* Where each bus is along its run — a secondary, exploratory view. */}
      <details
        className="group rounded-[var(--app-radius-md)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <summary className="tap-44-y flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--app-cool) 12%, transparent)", color: "var(--app-cool)" }}
            >
              <Bus className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                Where each bus is on its run
              </span>
              <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                Follow every active route as a live progress line
              </span>
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 transition group-open:rotate-180"
            strokeWidth={2.25}
            aria-hidden
            style={{ color: "var(--app-ink-3)" }}
          />
        </summary>
        <div className="px-3 pb-3 pt-1">
          <RoutePearls />
        </div>
      </details>

      {/* Plan and ride — the planning exits and rider services, demoted below
          the live dashboard. */}
      <section aria-labelledby="transit-plan-heading" className="space-y-2.5">
        <h2 id="transit-plan-heading" className="eyebrow px-1" style={{ color: "var(--app-ink-3)" }}>
          Plan and ride
        </h2>
        <p className="px-1 text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {fareFree
            ? "If you have not taken the bus here before, rides are free right now and every bus has a 2-bike front rack at no charge."
            : "If you have not taken the bus here before, every bus has a 2-bike front rack at no charge."}
        </p>
        <ul className="shelf-rail shelf-grid-sm -mx-4 gap-2 px-4 pb-2 sm:mx-0 sm:grid-cols-2 sm:px-0">
          {TRANSIT_ACT.map((intent) => (
            <IntentTile key={intent.label} intent={intent} />
          ))}
        </ul>

        <details
          className="group rounded-[var(--app-radius-md)] border"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
        >
          <summary
            className="tap-44-y flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            More rider services
            <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
          </summary>
          <ul className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1 sm:grid-cols-3">
            {TRANSIT_REFERENCE.map((intent) => (
              <IntentTile key={intent.label} intent={intent} layout="grid" />
            ))}
          </ul>
        </details>
      </section>

      {/* The full route catalog — reference, searchable. */}
      <TransitRouteFinder
        routes={staticRoutes.map((route) => {
          const match = grouped.find(
            ({ name }) => name.localeCompare(route.name, undefined, { sensitivity: "base" }) === 0,
          );
          const variations = match?.variations ?? [];
          return {
            id: route.id,
            short: route.short,
            name: route.name,
            destinations: Array.from(
              new Set(
                variations
                  .map((variation) => variation.destination?.trim())
                  .filter((destination): destination is string => Boolean(destination)),
              ),
            ),
            variationCount: Math.max(1, variations.length),
          };
        })}
      />

      {routesAge && (
        <p className="text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          The map uses the official TransIT GTFS network. Maryland Open Data was last updated {routesAge} and is used as a secondary comparison.
        </p>
      )}

      <footer
        className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          Route lines, stop locations, route names, and route colors come from an official TransIT GTFS
          snapshot{staticSnapshotDate ? ` downloaded ${staticSnapshotDate}` : ""}
          {serviceWindowStart && serviceWindowEnd ? `, covering ${serviceWindowStart} through ${serviceWindowEnd}` : ""}.
          Vehicle positions and inbound estimates use a separate GTFS-realtime feed and appear only as
          live information while that feed is responding.
        </p>
        <p>
          Frederick County&apos;s published schedules remain the source of truth for planned departure
          times, holiday service, and route changes.
        </p>
        <p className="flex flex-wrap items-center gap-3 pt-1">
          <a
            href={COUNTY_TRANSIT_SCHEDULES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44-y inline-flex items-center gap-1"
            style={{ color: "var(--app-cool)" }}
          >
            <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            Official TransIT schedules
          </a>
          <Link
            href="/contacts"
            className="tap-44-y inline-flex items-center gap-1"
            style={{ color: "var(--app-cool)" }}
          >
            <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            Department contact
          </Link>
        </p>
      </footer>
    </div>
  );
}
