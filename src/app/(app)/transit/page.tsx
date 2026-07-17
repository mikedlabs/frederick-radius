import type { Metadata } from "next";
import Link from "next/link";
import {
  Bus,
  ExternalLink,
  MapPin,
  Clock,
  Navigation,
  TrainFront,
  Accessibility,
  Ticket,
  Bike,
  Users,
  Search,
  type LucideIcon,
} from "lucide-react";

const COUNTY_TRANSIT_URL = "https://frederickcountymd.gov/105/Transit-Services";
const COUNTY_TRANSIT_PHONE = "301-600-2065";

// Common requests — intent-led entry tiles, same pattern as /contacts
// and /parking. Routes users by what they're trying to DO (catch the
// MARC, ride paratransit, buy a pass) instead of forcing them to read
// 36 route names hoping one looks right. The list intentionally
// answers the question, not the data's structure.
type TransitIntent = {
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  href: string;
  external?: boolean;
};

const TRANSIT_INTENTS: TransitIntent[] = [
  {
    label: "Schedules + fares",
    hint: "Current TransIT schedules, fare table, holiday changes",
    icon: Clock,
    accent: "var(--app-cool)",
    href: COUNTY_TRANSIT_URL,
    external: true,
  },
  {
    label: "Plan a trip with the bus",
    hint: "Google Maps with transit mode: drop in any Frederick address",
    icon: Navigation,
    accent: "var(--app-brand)",
    href: "https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=Frederick%2C+MD",
    external: true,
  },
  {
    label: "MARC to DC",
    hint: "Brunswick line: Brunswick + Point of Rocks → Silver Spring + DC",
    icon: TrainFront,
    accent: "var(--app-accent)",
    href: "https://www.mta.maryland.gov/schedule/marc-brunswick",
    external: true,
  },
  {
    label: "TransIT-plus (paratransit)",
    hint: "Door-to-door rides for disabled riders, book 1+ business days ahead",
    icon: Accessibility,
    accent: "var(--app-positive)",
    href: "https://frederickcountymd.gov/108/TransIT-Plus",
    external: true,
  },
  {
    label: "Bus pass + tickets",
    hint: "Daily, weekly, monthly, and reduced-fare passes",
    icon: Ticket,
    accent: "var(--app-brand-2)",
    href: COUNTY_TRANSIT_URL,
    external: true,
  },
  {
    label: "Bike on the bus",
    hint: "Every TransIT bus has a 2-bike front rack, first-come, no fee",
    icon: Bike,
    accent: "var(--app-cool)",
    href: COUNTY_TRANSIT_URL,
    external: true,
  },
  {
    label: "Senior reduced fare",
    hint: "Half-price for riders 60+, ADA-eligible, or Medicare cardholders",
    icon: Users,
    accent: "var(--app-warning)",
    href: COUNTY_TRANSIT_URL,
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
  getFrederickTransitStops,
  getTransitFreshness,
} from "@/lib/integrations/transitFrederick";
import TransitMap from "@/components/transit/TransitMapClient";
import NextTrainBoard from "@/components/transit/NextTrainBoard";
import LiveTransitPill from "@/components/transit/LiveTransitPill";
import TransitRouteFinder from "@/components/transit/TransitRouteFinder";
import PageBloom from "@/components/ui/PageBloom";
import TRANSIT_RAW from "@/data/transit.json" with { type: "json" };
import { Suspense } from "react";

export const metadata: Metadata = {
  alternates: { canonical: "/transit" },
  title: "Transit",
  description:
    "Frederick County TransIT routes: the local bus network, where it runs, where it goes.",
};

// Was weekly (route shapes change rarely). Lowered to 60s so the live
// MARC next-train board stays fresh; the route + stop loaders keep
// their own weekly fetch cache, so the page regen does not refetch
// them, and the MARC realtime fetch carries its own 30s cache.
export const revalidate = 60;

/**
 * /transit — the local bus network at a glance.
 *
 * Pre-launch field-guide bet: the visitor question "what does
 * Frederick's transit even look like?" deserves a real answer, not a
 * footnote. The county runs TransIT with 36 fixed routes that connect
 * the towns; we already had the data loader (MD Open Data, keyless,
 * weekly revalidate). This rebuild surfaces it as a real map plus a
 * full route list, replacing the earlier text-only list that linked
 * out to /map?at=.
 *
 * What's here
 *   - The map: every route drawn in Carroll Creek slate on the same
 *     Frederick-palette base tiles the rest of the app uses. One
 *     color for the whole network so it reads as a system instead
 *     of a colorful spaghetti diagram.
 *   - The list: alphabetical / numeric-aware sort, grouped by route
 *     name (variations collapse into one entry), with destination
 *     summary.
 *   - The honest footer: stops + schedules need the live GTFS feed
 *     from the county, which isn't published yet. When it is, that
 *     phase adds bus icons + real-time positions on the same map.
 *
 * Server component; both data fetches run in parallel with the same
 * weekly revalidate window. TransitMap is the only client surface and
 * receives the GeoJSON as props.
 */
/**
 * Format an ISO timestamp as a relative "Updated X ago" string.
 * Returns null on bad input so callers can decide whether to render
 * the badge at all — we never claim a freshness we can't prove.
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

export default async function TransitPage() {
  // All four fetches run in parallel. Each independently revalidates
  // on its own schedule (routes + stops weekly, freshness daily).
  const [shapes, routes, stops, freshness] = await Promise.all([
    getFrederickTransitRouteShapes(),
    getFrederickTransitRoutes(),
    getFrederickTransitStops(),
    getTransitFreshness(),
  ]);
  const routesAge = relativeAge(freshness.routesUpdatedAt);
  const stopsAge = relativeAge(freshness.stopsUpdatedAt);

  // Group routes by name so variations of one route (e.g. inbound +
  // outbound) collapse to one entry in the list. Variations stay
  // distinct on the map.
  const byName = new Map<string, typeof routes>();
  for (const r of routes) {
    const arr = byName.get(r.name) ?? [];
    arr.push(r);
    byName.set(r.name, arr);
  }
  const grouped = Array.from(byName.entries())
    .map(([name, variations]) => ({ name, variations }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p
          className="eyebrow inline-flex items-center gap-1.5"
          style={{ color: "var(--app-ink-3)" }}
        >
          <Bus
            className="h-3 w-3"
            strokeWidth={2.25}
            style={{ color: "var(--app-cool)" }}
            aria-hidden
          />
          Getting around
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          The bus, mapped.
        </h1>
        <p
          className="text-[15px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          See the moving network, catch the next MARC train, or jump straight
          to schedules, fares and accessible service.
        </p>
        {/* The headline fact, previously invisible: rides cost nothing.
            Gated on the data flag so if the county ever reinstates fares
            (the GTFS refresh flips fareFree) the line disappears rather
            than lies. County FAQ, checked 2026-07-17: "All Transit
            Services are currently free." */}
        {(TRANSIT_RAW as { fareFree?: boolean }).fareFree && (
          <p className="text-[14px] font-semibold" style={{ color: "var(--app-brand-2)" }}>
            Every ride is free. No fares, no passes, no app.
          </p>
        )}
        {/* Live "N buses moving now" from the GTFS-realtime feed. */}
        <div className="pt-1"><LiveTransitPill /></div>
      </header>

      {/* Common requests — intent-led entry tiles for the things
          people actually arrive needing (MARC connection,
          paratransit booking, lost-item recovery). Routes them
          straight to the right destination instead of making them
          guess from 36 route names. Same pattern as /contacts and
          /parking. */}
      <section
        aria-labelledby="transit-intent-heading"
        className="space-y-2.5"
      >
        <h2
          id="transit-intent-heading"
          className="eyebrow px-1"
          style={{ color: "var(--app-ink-3)" }}
        >
          Common requests
        </h2>
        <ul className="shelf-rail shelf-grid-sm -mx-4 gap-2 px-4 pb-2 sm:mx-0 sm:grid-cols-4 sm:px-0">
          {TRANSIT_INTENTS.map((intent) => {
            const Icon = intent.icon;
            return (
              <li key={intent.label} className="w-[10rem] shrink-0 snap-start sm:w-auto">
                <a
                  href={intent.href}
                  target={intent.external ? "_blank" : undefined}
                  rel={intent.external ? "noopener noreferrer" : undefined}
                  aria-label={`${intent.label}: ${intent.hint}`}
                  className="hover-lift flex h-full flex-col items-start gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition"
                  style={{
                    borderColor: "var(--app-border)",
                    boxShadow:
                      "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                  }}
                >
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                    style={{
                      background: `color-mix(in srgb, ${intent.accent} 14%, transparent)`,
                    }}
                  >
                    <Icon
                      className="h-4 w-4"
                      strokeWidth={2}
                      style={{ color: intent.accent }}
                    />
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block text-[13px] font-semibold leading-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {intent.label}
                    </span>
                    <span
                      className="mt-0.5 block text-[11px] leading-snug"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {intent.hint}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Live MARC next-train board — the capability locals cannot get
          from MTA's system-wide site: a Frederick-scoped "when is the
          next train" view across the four county stations. Suspense so
          the realtime fetch never blocks the rest of the page. */}
      <Suspense
        fallback={
          <div
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-center text-[13px]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            Checking the MARC live feed…
          </div>
        }
      >
        <NextTrainBoard />
      </Suspense>

      <TransitMap shapes={shapes} stops={stops} liveBuses highlightRoutes />

      {/* Freshness disclosure — surfaces the upstream "rowsUpdatedAt"
          timestamp from Socrata so the user can judge whether what
          they're looking at is still current. Proposal D's gate: we
          never PRETEND the network data is fresh — we tell the user
          and let them decide. Renders only when the probe succeeded;
          a failed probe means we don't claim a date we can't prove. */}
      {(routesAge || stopsAge) && (
        <p
          className="text-[11px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          Network data from Maryland Open Data.{" "}
          {stopsAge && (
            <>
              <span style={{ color: "var(--app-ink-2)" }}>
                Stops
              </span>{" "}
              updated {stopsAge}
              {routesAge ? "; " : "."}
            </>
          )}
          {routesAge && (
            <>
              <span style={{ color: "var(--app-ink-2)" }}>
                routes
              </span>{" "}
              updated {routesAge}.
            </>
          )}
        </p>
      )}

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

      <footer
        className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          Route shapes and {stops.length > 0 ? `${stops.length} stops` : "stops"}{" "}
          come from Maryland Open Data (Frederick County TransIT). Live bus
          positions stream from the county&apos;s public GTFS-realtime feed and
          refresh every few seconds. Scheduled next-departure times aren&apos;t
          in that feed yet; a future phase will add them here.
        </p>
        <p className="flex flex-wrap items-center gap-3 pt-1">
          <a
            href="https://frederickcountymd.gov/105/Transit-Services"
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44-y inline-flex items-center gap-1"
            style={{ color: "var(--app-cool)" }}
          >
            <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            County TransIT (schedules)
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
