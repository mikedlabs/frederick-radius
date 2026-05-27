import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsInMunicipality, nearTown, BY_TOWN_ENABLED } from "@/lib/loaders/events";
import { decoratePlace, publicPlacesByMunicipality } from "@/lib/loaders/places";
import PlaceList from "@/components/place/PlaceList";
import EventCard from "@/components/event/EventCard";
import PhotoMosaic from "@/components/today/PhotoMosaic";
import PageBloom from "@/components/ui/PageBloom";
import SectionHeading from "@/components/ui/SectionHeading";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";

export const revalidate = 600;

/**
 * Town page — rebuilt to three answers instead of seven sections.
 *
 * Per the architecture review: a town page should answer "what's
 * here / what's happening / how to get there" — not be a four-cell
 * stat dashboard with parallel browse rails.
 *
 * New spine:
 *   1. Photo hero — name + blurb + type/era/population overlay
 *   2. One-line description
 *   3. Worth your time — top 8 places (grid by default)
 *   4. Looks like {town} — photo mosaic (4+ photo-backed places)
 *   5. Upcoming in {town} — max 4 events (empty state shows the
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

  const upcomingEvents = eventsInMunicipality(m.slug).slice(0, 4);
  const nearbyEvents = BY_TOWN_ENABLED ? nearTown(m.slug, new Date()) : [];

  // The town hero is now an aerial drone photograph of Frederick County
  // from the owner's seasonal collection (rotates daily, picks by
  // current season). The page used to lead with the top venue's Google
  // photo — usually a restaurant interior shot — which read as utility,
  // not identity. An aerial reads as the PLACE; the venue photo then
  // lives further down inside PlaceList and the "Looks like {town}"
  // mosaic, where it belongs.
  const placesWithPhotos = places.filter((p) => p.google_photo_url);

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />

      {/* Photo hero — the place as a place, not a row. The image
          carries identity; the overlay carries facts. */}
      <header className="relative -mx-4 -mt-4 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-[var(--app-radius-lg)]">
        <div className="relative h-52 w-full sm:h-60">
          <SeasonalPhoto
            season="auto"
            alt={`Frederick County (near ${m.name})`}
            priority
            sizes="(max-width: 720px) 100vw, 720px"
            className="absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
              {m.type} · est. {m.est} · pop. {m.population.toLocaleString()}
            </p>
            <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-tight text-white">
              {m.name}, Maryland
            </h1>
            <p className="font-serif text-[15px] italic text-white/85">
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

      {/* Worth your time — the answer to "what's here." Top 8 by
          feature score; grid-by-default so a scroll feels like a
          gallery, not a list. */}
      <section className="space-y-2.5">
        <SectionHeading title="Worth your time" />
        <PlaceList
          places={places.slice(0, 8)}
          initialLayout="grid"
          emptyMessage={`We're still seeding places for ${m.name}. Check back soon, or submit a place you love.`}
        />
      </section>

      {/* Photo wall — the page-level identity beat. A column of
          pictures of a real place. Only renders when there are enough
          photo-backed places to fill it. */}
      {placesWithPhotos.length >= 4 && (
        <section className="space-y-3">
          <SectionHeading title={`Looks like ${m.name}`} />
          <PhotoMosaic places={placesWithPhotos} />
        </section>
      )}

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
    </div>
  );
}
