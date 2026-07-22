import type { Metadata } from "next";
import Link from "next/link";
import {
  Bus,
  ExternalLink,
  MapPin,
  Clock,
  TrainFront,
  Accessibility,
  Ticket,
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
    label: "Accessibility + rider help",
    hint: "Lift, ramp, securement, and travel-training information",
    icon: Ticket,
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
} from "@/lib/integrations/transitFrederick";
import { getMarcBoard, getMarcAlerts } from "@/lib/integrations/marcTrains";
import TransitMap from "@/components/transit/TransitMapClient";
import TransitNow from "@/components/transit/TransitNow";
import NextTrainBoard from "@/components/transit/NextTrainBoard";
import NextStopsBoard from "@/components/transit/NextStopsBoard";
import RoutePearls from "@/components/transit/RoutePearls";
import TransitRouteFinder from "@/components/transit/TransitRouteFinder";
import PageBloom from "@/components/ui/PageBloom";
import TRANSIT_RAW from "@/data/transit.json" with { type: "json" };

export const metadata: Metadata = {
  alternates: { canonical: "/transit" },
  title: "Transit",
  description:
    "Frederick County TransIT and MARC: catch the next train or bus, see what is moving now, then the routes and rider services.",
};

// 60s so the live MARC next-train board and the schedule-derived hero
// countdown stay fresh; the route + shape loaders keep their own weekly fetch
// cache, and the MARC realtime fetch carries its own 30s cache.
export const revalidate = 60;

/**
 * /transit — a boards-first transit dashboard.
 *
 * The page answers "what can I catch right now, and when" before any reference
 * or exit. Order: the next-ride hero (nearest MARC countdown + buses now), the
 * all-stations MARC board, the live bus arrivals board, the live map (buses,
 * rail, and tappable stops), then where-is-my-bus, the plan/ride shelf, the
 * route finder, and the sourcing footer.
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

function IntentTile({ intent }: { intent: TransitIntent }) {
  const Icon = intent.icon;
  return (
    <li className="w-[10rem] shrink-0 snap-start sm:w-auto">
      <a
        href={intent.href}
        target={intent.external ? "_blank" : undefined}
        rel={intent.external ? "noopener noreferrer" : undefined}
        aria-label={`${intent.label}: ${intent.hint}`}
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
  // All fetches run in parallel; each revalidates on its own schedule (routes
  // + shapes weekly, freshness daily, the two MARC feeds ~30-60s).
  const [shapes, routes, freshness, board, alerts] = await Promise.all([
    getFrederickTransitRouteShapes(),
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

  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow inline-flex items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
          <Bus className="h-3 w-3" strokeWidth={2.25} style={{ color: "var(--app-cool)" }} aria-hidden />
          Getting around
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Catch the next one.
        </h1>
        <p className="text-[15px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          The next MARC train and the buses moving right now, then the routes, the map, and the rider
          services you look up once.
        </p>
      </header>

      {/* Next-ride hero: nearest MARC countdown + buses moving now. */}
      <TransitNow board={board} />

      {/* All four county MARC stations, both directions, with any service
          alerts. Fetched once above and handed to the board. */}
      <NextTrainBoard board={board} alerts={alerts} />

      {/* Live bus arrivals — every bus by soonest next stop, counting down. */}
      <NextStopsBoard />

      {/* The live map: buses and trains gliding on the network, plus tappable
          stops (name, routes here, live inbound arrivals). */}
      <TransitMap shapes={shapes} liveBuses highlightRoutes interactiveStops />

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
              <IntentTile key={intent.label} intent={intent} />
            ))}
          </ul>
        </details>
      </section>

      {/* The full route catalog — reference, searchable. */}
      <TransitRouteFinder
        routes={grouped.map(({ name, variations }) => ({
          name,
          destinations: Array.from(
            new Set(
              variations
                .map((v) => v.destination?.trim())
                .filter((d): d is string => Boolean(d)),
            ),
          ),
          variationCount: variations.length,
        }))}
      />

      {routesAge && (
        <p className="text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          Route shapes are from Maryland Open Data, updated {routesAge}.
        </p>
      )}

      <footer
        className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          Route lines come from Maryland Open Data. Stop locations, route names, and route colors come
          from a static TransIT GTFS snapshot{staticSnapshotDate ? ` downloaded ${staticSnapshotDate}` : ""}
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
