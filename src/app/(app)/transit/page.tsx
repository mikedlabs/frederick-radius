import type { Metadata } from "next";
import { Suspense } from "react";
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
import { officialTransitRouteShapesFC } from "@/lib/integrations/transitFrederick";
import { getMarcBoard, getMarcAlerts } from "@/lib/integrations/marcTrains";
import TransitMap from "@/components/transit/TransitMapClient";
import TransitNow from "@/components/transit/TransitNow";
import NextTrainBoard from "@/components/transit/NextTrainBoard";
import NextStopsBoard from "@/components/transit/NextStopsBoard";
import RoutePearls from "@/components/transit/RoutePearls";
import TransitRouteFinder from "@/components/transit/TransitRouteFinder";
import TransitStopFinder from "@/components/transit/TransitStopFinder";
import TransitServiceAlerts from "@/components/transit/TransitServiceAlerts";
import styles from "@/components/transit/TransitExperience.module.css";
import TRANSIT_RAW from "@/data/transit.json" with { type: "json" };
import { CURRENT_TRANSIT_STOP_COUNT } from "@/lib/transit-static";

export const metadata: Metadata = {
  alternates: { canonical: "/transit" },
  title: "Transit",
  description:
    "Live Frederick County TransIT arrivals, route maps, and MARC departures.",
};

// 60s so the live MARC next-train board and the schedule-derived hero
// countdown stay fresh. The official route network is committed, and MARC
// realtime reads retain their existing cache lifetimes.
export const revalidate = 60;

/**
 * /transit — departures first, with the network map available on demand.
 *
 * The page answers the rider's stop-level decision before any network-wide
 * reference: where is my stop, what is inbound, and do I have enough time to
 * walk there. Order: rider command center and live map, network status, expandable
 * system-wide boards, then planning and reference tools.
 *
 * Live data that exists today: TransIT vehicle positions with a resolved next
 * stop + ETA (GTFS-realtime), MARC schedule with a realtime delay overlay, and
 * per-stop bus arrivals (GTFS-realtime TripUpdates, surfaced on stop tap).
 * TransIT also publishes official schedules and a static GTFS feed. Radius uses
 * that static feed for the network snapshot, but does not present it as live.
 */
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

function IntentTile({ intent, layout = "rail" }: { intent: TransitIntent; layout?: "rail" | "grid" }) {
  const Icon = intent.icon;
  return (
    <li className={layout === "grid" ? "min-w-0" : "w-[10rem] shrink-0 snap-start sm:w-auto"}>
      <a
        href={intent.href}
        target={intent.external ? "_blank" : undefined}
        rel={intent.external ? "noopener noreferrer" : undefined}
        className={styles.referenceTile}
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

type MarcBoardPromise = ReturnType<typeof getMarcBoard>;

async function NetworkStatus({ board }: { board: MarcBoardPromise }) {
  return <TransitNow board={await board} />;
}

async function MarcStations({ board, alerts }: {
  board: MarcBoardPromise;
  alerts: ReturnType<typeof getMarcAlerts>;
}) {
  const [resolvedBoard, resolvedAlerts] = await Promise.all([board, alerts]);
  return <NextTrainBoard board={resolvedBoard} alerts={resolvedAlerts} />;
}

export default async function TransitPage() {
  // The stop finder and route catalog use the committed official network.
  // Slow secondary train data must not hold the rider's first useful screen.
  // Share one board request between its two consumers instead of refetching.
  const board = getMarcBoard(new Date());
  const alerts = getMarcAlerts();
  const shapes = officialTransitRouteShapesFC();
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
    <div className={`${styles.page} relative space-y-5`}>
      <header className={styles.masthead}>
        <div>
          <p className={styles.kicker}>
            <Bus className="h-4 w-4" strokeWidth={2.1} aria-hidden />
            Frederick County
          </p>
          <h1>Transit</h1>
          <p>Find your stop, see the next buses, and know when to start walking. MARC departures are here too.</p>
        </div>
        <svg className={styles.mastheadGraphic} viewBox="0 0 200 80" fill="none" aria-hidden="true" focusable="false">
          <path d="M8 58H57C78 58 78 22 99 22H191" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M8 70H70C91 70 91 34 112 34H191" stroke="var(--app-border)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="58" r="7" fill="var(--app-bg)" stroke="currentColor" strokeWidth="3" />
          <circle cx="105" cy="22" r="7" fill="var(--app-bg)" stroke="currentColor" strokeWidth="3" />
          <circle cx="178" cy="22" r="7" fill="var(--app-bg)" stroke="currentColor" strokeWidth="3" />
        </svg>
      </header>

      <TransitServiceAlerts />

      {/* The primary rider decision: choose a stop, compare the walk with live
          arrivals, and keep frequently used stops one tap away. */}
      <div className={styles.workspace}>
        <TransitStopFinder />
        <section aria-labelledby="live-network-heading" className={styles.liveNetwork}>
          <div className={styles.mapHeading}>
            <div>
              <h2
                id="live-network-heading"
                className="text-[18px] font-semibold tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Network map
              </h2>
              <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                Open the map to follow a bus or explore its route.
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
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
            deferUntilRequested
          />
        </section>
      </div>

      {/* Network-wide context follows the rider's own stop decision. */}
      <Suspense fallback={<p className="text-[13px]" style={{ color: "var(--app-ink-2)" }} role="status">Loading the wider network… Your stop remains available above.</p>}>
        <NetworkStatus board={board} />
      </Suspense>

      <a
        href="https://frederickcountymd.gov/222/Accessibility-Features"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.accessibility}
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
            <Suspense fallback={<p className="text-[13px]" style={{ color: "var(--app-ink-2)" }} role="status">Loading MARC departures…</p>}>
              <MarcStations board={board} alerts={alerts} />
            </Suspense>
          </div>
        </details>
      </div>

      {/* Approximate mapped positions, never a trip's ordered stop sequence. */}
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
                Route overview
              </span>
              <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                Reported bus locations on a schematic route line
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
        routes={staticRoutes.flatMap((route) => {
          const variations = shapes.features.filter(
            (feature) => feature.properties.routeId === route.id,
          );
          if (variations.length === 0) return [];
          return [{
            id: route.id,
            short: route.short,
            name: route.name,
            destinations: Array.from(
              new Set(
                variations
                  .flatMap((variation) => typeof variation.properties.headsigns === "string"
                    ? variation.properties.headsigns.split(" · ").map((headsign) => headsign.trim())
                    : [])
                  .filter((destination): destination is string => Boolean(destination)),
              ),
            ),
            variationCount: variations.length,
          }];
        })}
      />

      <footer
        className={`${styles.sourceNotes} space-y-1`}
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
            style={{ color: "var(--app-link)" }}
          >
            <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            Official TransIT schedules
          </a>
          <Link
            href="/contacts"
            className="tap-44-y inline-flex items-center gap-1"
            style={{ color: "var(--app-link)" }}
          >
            <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            Department contact
          </Link>
        </p>
      </footer>
    </div>
  );
}
