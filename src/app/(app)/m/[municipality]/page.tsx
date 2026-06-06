import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsInMunicipality, nearTown, BY_TOWN_ENABLED } from "@/lib/loaders/events";
import { decoratePlace, publicPlacesByMunicipality } from "@/lib/loaders/places";
import { isRecommendable, isDestinationCategory } from "@/lib/relevance";
import PlaceList from "@/components/place/PlaceList";
import EventCard from "@/components/event/EventCard";
import PageBloom from "@/components/ui/PageBloom";
import SectionHeading from "@/components/ui/SectionHeading";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
import TownStrip from "@/components/municipality/TownStrip";
import AerialBeat from "@/components/place/AerialBeat";
import StayDeepLinks from "@/components/municipality/StayDeepLinks";
import CivicCard from "@/components/municipality/CivicCard";
import TownLinks from "@/components/municipality/TownLinks";
import { municipalCivicFor } from "@/lib/loaders/municipalCivic";

export const revalidate = 600;

/**
 * Town page — rebuilt to three answers instead of seven sections.
 *
 * Per the architecture review: a town page should answer "what's
 * here / what's happening / how to get there" — not be a four-cell
 * stat dashboard with parallel browse rails.
 *
 * New spine:
 *   1. Curated hero — seasonal county photography + name/blurb overlay
 *   2. One-line description
 *   3. Worth your time — top 8 places (grid by default)
 *   4. Upcoming in {town} — max 4 events (empty state shows the
 *      submit-an-event door + a nearby fallback)
 *
 * What got cut
 *   - StatStrip (Places / Verified / Categories / Events counts) —
 *     generic numbers without signal
 *   - "Around {town}" category-tile row — duplicate browse axis;
 *     the place list and the global /category/[slug] surfaces already
 *     do this work
 *
 * The page is about the town, not about the directory's shape.
 */

export async function generateStaticParams() {
  return MUNICIPALITIES.map((m) => ({ municipality: m.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ municipality: string }> }
): Promise<Metadata> {
  const { municipality } = await params;
  const m = MUNICIPALITY_BY_SLUG[municipality];
  if (!m) return { title: "Not found" };
  return {
    title: `${m.name}, Maryland`,
    description: m.description,
    alternates: { canonical: `/m/${municipality}` },
    openGraph: {
      title: m.name,
      description: m.hero_blurb,
      images: [{ url: `/api/og?type=municipality&slug=${municipality}`, width: 1200, height: 630 }],
    },
  };
}

export default async function MunicipalityPage(
  { params }: { params: Promise<{ municipality: string }> }
) {
  const { municipality } = await params;
  const m = MUNICIPALITY_BY_SLUG[municipality];
  if (!m) notFound();

  const places = publicPlacesByMunicipality(m.slug)
    .map((p) => decoratePlace(p, m.centroid))
    .sort((a, b) => b.feature_score - a.feature_score);

  // "Worth your time" is a destination-led reel that ranks differently
  // from the raw feature_score order. Two fixes for audit T4 — the page
  // promised breweries/
  // arts but led with Crossfits, training studios, and a meeting house:
  //   1. isRecommendable drops pure institutions (a no-op today since these
  //      rows lack a Google primary_type, but it future-proofs the surface
  //      and keeps it consistent with every other recommendation surface).
  //   2. Destinations (food/arts/outdoors/shops) sort ABOVE personal-service
  //      and civic/utility categories (wellness/services/worship…). Within
  //      each group, feature_score still orders. A stable sort keeps it
  //      deterministic. Down-rank, never delete — a thin town still fills.
  const worthYourTime = places
    .filter(isRecommendable)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const da = isDestinationCategory(a.p.category) ? 0 : 1;
      const db = isDestinationCategory(b.p.category) ? 0 : 1;
      return da - db || b.p.feature_score - a.p.feature_score || a.i - b.i;
    })
    .map((x) => x.p);

  const upcomingEvents = eventsInMunicipality(m.slug).slice(0, 4);
  const nearbyEvents = BY_TOWN_ENABLED ? nearTown(m.slug, new Date()) : [];
  // Buried-civic answers for this town (trash/recycling, hall, permits…),
  // null until the extraction agent populates it. The card self-hides.
  const civic = municipalCivicFor(m.slug);

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />

      {/* Sibling-town nav — horizontal pill strip with the active
          town pinned first. Pre-launch the only way to switch towns
          was via /browse + search; this lets a user jump directly
          between municipalities while staying in the town-page
          mental model. */}
      <TownStrip activeSlug={m.slug} />

      {/* Town hero — CURATED imagery only (Photo Policy, Phase 3). The
          identity image is our own seasonal county photography, never a
          random top place's imported Google photo (which used to define a
          town by whatever storefront ranked highest). AerialBeat below
          adds the controlled drone shot where the archive covers it. */}
      <header className="relative -mx-4 -mt-4 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-[var(--app-radius-lg)]">
        <div className="relative h-52 w-full sm:h-72">
          <SeasonalPhoto
            season="auto"
            alt={`Frederick County (near ${m.name})`}
            priority
            sizes="(max-width: 720px) 100vw, 720px"
            className="absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">
              {m.type} · est. {m.est} · pop. {m.population.toLocaleString()}
            </p>
            <h1 className="font-serif text-[34px] font-semibold leading-tight tracking-tight text-white sm:text-[40px]">
              {m.name}, Maryland
            </h1>
            <p className="font-serif text-[15px] italic leading-snug text-white/90 sm:text-[16px]">
              {m.hero_blurb}
            </p>
          </div>
        </div>
      </header>

      {/* The one-line context. The full description is in metadata for
          SEO; this is the human read. */}
      <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {m.description}
      </p>

      {/* "{Town} from above" — the nearest geotagged drone shot. Only the
          towns the aerial archive actually covers (Frederick) render this;
          everywhere else it self-hides rather than fake an aerial. */}
      <AerialBeat lat={m.centroid.lat} lng={m.centroid.lng} label={m.name} maxMeters={1500} />

      {/* Buried-civic answers — the moat. Town hall, trash/recycling,
          permits, utilities, with source + freshness. Self-hides until
          the extraction agent has populated this town. */}
      <CivicCard rec={civic} />

      {/* Official town website + civic deep links (town-websites.ts). */}
      <TownLinks slug={m.slug} />

      {/* Worth your time — the answer to "what's here." Top 8 by
          feature score; grid-by-default so a scroll feels like a
          gallery, not a list. */}
      <section className="space-y-2.5">
        <SectionHeading title="Worth your time" />
        <PlaceList
          places={worthYourTime.slice(0, 8)}
          initialLayout="grid"
          emptyMessage={`We're still seeding places for ${m.name}. Check back soon, or submit a place you love.`}
        />
      </section>

      {/* (The "Looks like {town}" photo mosaic was removed — Photo Policy,
          Phase 3. Its pool was imported place photos with no quality gate;
          a guessy collage of scraped storefronts hurt more than it helped.
          The curated SeasonalPhoto hero + AerialBeat carry town identity.) */}

      {/* Upcoming — answer to "what's happening." Kept tight (max 4);
          empty state surfaces the submit door + a nearby fallback. */}
      {(upcomingEvents.length > 0 || BY_TOWN_ENABLED) && (
        <section className="space-y-2.5">
          <SectionHeading
            title={`Upcoming in ${m.name}`}
            href={BY_TOWN_ENABLED ? `/events?view=town&m=${m.slug}` : "/events"}
            cta="All events"
          />
          {upcomingEvents.length > 0 ? (
            <ul className="space-y-2">
              {upcomingEvents.map((e) => (
                <li key={e.slug}><EventCard event={e} /></li>
              ))}
            </ul>
          ) : (
            <div
              className="space-y-3 rounded-[var(--app-radius-lg)] border border-dashed p-4"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--app-ink-2)" }}>
                Nothing on the calendar for {m.name} yet — it runs on word of mouth.
              </p>
              <Link
                href={`/submit/event?m=${m.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--app-shadow-1)]"
                style={{ background: "var(--app-brand)" }}
              >
                Submit an event for {m.name}
              </Link>
              {nearbyEvents.length > 0 && (
                <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                    Happening near {m.name}
                  </p>
                  <ul className="space-y-2">
                    {nearbyEvents.slice(0, 3).map((e) => (
                      <li key={e.slug}><EventCard event={e} /></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Footer card — visitor's "where do I sleep?" answer in one
          tap. Three platform search deep links, pre-filtered to the
          town. Not an affiliate program; the URLs are clean. A
          curated local-rental list will land here later. */}
      <StayDeepLinks townName={m.name} townSlug={m.slug} />
    </div>
  );
}
