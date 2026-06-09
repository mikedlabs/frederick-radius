import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { MapIcon, ArrowRight } from "lucide-react";
import { rankPlaces, likelyOpenPlaces } from "@/lib/loaders/places";
import { isRecommendable, isDestinationCategory } from "@/lib/relevance";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import PlaceList from "@/components/place/PlaceList";
import PageBloom from "@/components/ui/PageBloom";
import FreshnessGuard from "@/components/today/FreshnessGuard";

/**
 * /open-now — the fast list answer to the app's most urgent question.
 *
 * June-9 review §4: "What's open right now?" routed to /map?open=now —
 * a ~2MB Mapbox surface — making the heaviest page in the app the front
 * door for the most time-critical need. The review's rule: question →
 * list answer first → optional map. This page is that list: server-
 * rendered, no Mapbox, ranked from the user's home town (fr_home_muni
 * cookie, downtown fallback) exactly like category pages (C2).
 *
 * Honesty rules:
 *   - The headline count is derived from THE SAME list rendered below,
 *     so the number can never contradict the content (review §7 caught
 *     "146 open" next to "Open now 0" — numbers from different sources).
 *   - Verified-open (Google hours say open) leads; "likely open" places
 *     (curated reliable windows, hours unverified) are labeled as such.
 *   - FreshnessGuard: a cached shell never presents an old evening as
 *     "right now."
 */

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/open-now" },
  title: "Open now",
  description:
    "What's open right now across Frederick County — verified against live hours, ranked from your town.",
};

export default async function OpenNowPage() {
  const store = await cookies();
  const homeMuni = store.get("fr_home_muni")?.value ?? null;
  const homeCentroid: LngLat | null = homeMuni
    ? (MUNICIPALITY_BY_SLUG[homeMuni]?.centroid ?? null)
    : null;
  const origin = homeCentroid ?? FREDERICK_CENTER;
  const now = new Date();

  // Destinations (food/arts/outdoors/shops) sort above personal-service
  // and civic categories — same rule as the town "worth your time" rail
  // (#500): a counseling office being open is true but it's never the
  // answer to "what's open right now?". Stable sort keeps the quality+
  // proximity order within each group.
  const verified = rankPlaces({ origin, now, preferOpen: true, limit: 500 })
    .filter((p) => p.open_status.state === "open")
    .filter(isRecommendable)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const da = isDestinationCategory(a.p.category) ? 0 : 1;
      const db = isDestinationCategory(b.p.category) ? 0 : 1;
      return da - db || a.i - b.i;
    })
    .map((x) => x.p);
  const verifiedSlugs = new Set(verified.map((p) => p.slug));
  const likely = likelyOpenPlaces(origin, now).filter(
    (p) => isRecommendable(p) && !verifiedSlugs.has(p.slug),
  );

  const asOf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  const fromLabel =
    homeMuni && MUNICIPALITY_BY_SLUG[homeMuni]
      ? ` · ranked from ${MUNICIPALITY_BY_SLUG[homeMuni].name}`
      : "";

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />
      <FreshnessGuard renderedAtIso={now.toISOString()} />

      <header className="space-y-2">
        <h1
          className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Open right now
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {verified.length} places verified open against live hours · as of {asOf}
          {fromLabel}.
        </p>
      </header>

      {verified.length > 0 ? (
        <PlaceList places={verified.slice(0, 60)} initialLayout="grid" />
      ) : (
        <p className="text-[14px]" style={{ color: "var(--app-ink-2)" }}>
          Nothing is verified open at this hour. The likely-open list below is
          built from places with reliable posted hours — check before you go.
        </p>
      )}

      {likely.length > 0 && (
        <section className="space-y-2.5">
          <h2
            className="text-xs font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Likely open · hours unverified
          </h2>
          <PlaceList
            places={likely.slice(0, 12)}
            initialLayout="list"
            emptyMessage=""
          />
        </section>
      )}

      {/* Optional map fallback — the review's rule: list answer first,
          map second. This is the ONE door into the heavy surface. */}
      <Link
        href="/map?mode=browse&open=now"
        className="tactile tactile-interactive group flex items-center gap-3 rounded-full px-4 py-3"
        style={{
          background: "var(--app-bg-elevated-solid)",
          boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)",
        }}
      >
        <MapIcon
          className="h-[18px] w-[18px] shrink-0"
          strokeWidth={2.25}
          style={{ color: "var(--app-brand)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-[14px] font-medium" style={{ color: "var(--app-ink-2)" }}>
          See these on the map
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.5}
          style={{ color: "var(--app-brand)" }}
          aria-hidden
        />
      </Link>
    </div>
  );
}
