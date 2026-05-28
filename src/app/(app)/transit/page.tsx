import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bus, ExternalLink, MapPin } from "lucide-react";
import {
  getFrederickTransitRoutes,
  getFrederickTransitRouteShapes,
  getFrederickTransitStops,
  getTransitFreshness,
} from "@/lib/integrations/transitFrederick";
import TransitMap from "@/components/transit/TransitMap";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  title: "Transit",
  description:
    "Frederick County TransIT routes — the local bus network, where it runs, where it goes.",
};

// Route shapes change rarely; weekly revalidate matches the loader.
export const revalidate = 604_800;

/**
 * /transit — the local bus network at a glance.
 *
 * Pre-launch field-guide bet: the visitor question "what does
 * Frederick's transit even look like?" deserves a real answer, not a
 * footnote. The county runs TransIT with 36 fixed routes that connect
 * the towns; we already had the data loader (MD Open Data, keyless,
 * weekly revalidate). This rebuild surfaces it as a real map plus a
 * full route list, replacing the earlier text-only list that linked
 * out to /map?focus=.
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
  const years = Math.floor(days / 365);
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

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

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
          Frederick County TransIT runs the local bus network. Every
          route drawn here is a real one, in service today. Stops and
          schedules live on the county&apos;s site for now.
        </p>
      </header>

      <TransitMap shapes={shapes} stops={stops} />

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

      <section className="space-y-3">
        <header className="flex items-baseline gap-2">
          <h2
            className="font-serif text-[20px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            All routes
          </h2>
          <span
            className="ml-auto text-[11px] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {grouped.length} {grouped.length === 1 ? "route" : "routes"}
          </span>
        </header>

        {grouped.length === 0 ? (
          <p
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-[13px]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            Route data unavailable right now. Check back shortly.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {grouped.map(({ name, variations }) => {
              const destinations = Array.from(
                new Set(
                  variations
                    .map((v) => v.destination?.trim())
                    .filter((d): d is string => Boolean(d)),
                ),
              );
              return (
                <li key={name}>
                  <article
                    className="relative h-full overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3"
                    style={{
                      borderColor: "var(--app-border)",
                      boxShadow:
                        "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                    }}
                  >
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{ background: "var(--app-cool)" }}
                    />
                    <div className="ml-2 flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
                        style={{
                          background:
                            "color-mix(in srgb, var(--app-cool) 14%, transparent)",
                          color: "var(--app-cool)",
                        }}
                      >
                        <Bus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p
                          className="text-[14px] font-semibold tracking-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {name}
                        </p>
                        {destinations.length > 0 && (
                          <p
                            className="text-[12px] leading-snug text-pretty"
                            style={{ color: "var(--app-ink-2)" }}
                          >
                            {destinations.join(" · ")}
                          </p>
                        )}
                        <p
                          className="text-[10.5px] uppercase tracking-[0.08em]"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {variations.length}{" "}
                          {variations.length === 1 ? "variation" : "variations"}
                        </p>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer
        className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          Route shapes and {stops.length > 0 ? `${stops.length} stops` : "stops"}{" "}
          come from Maryland Open Data (Frederick County TransIT). Live
          schedules and real-time vehicle positions need the county&apos;s
          GTFS feed, which isn&apos;t published yet &mdash; when it is,
          a future phase will add next-departure times and bus icons
          to this map.
        </p>
        <p className="flex flex-wrap items-center gap-3 pt-1">
          <a
            href="https://frederickcountymd.gov/105/Transit-Services"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1"
            style={{ color: "var(--app-cool)" }}
          >
            <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            County TransIT (schedules)
          </a>
          <Link
            href="/contacts"
            className="inline-flex items-center gap-1"
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
