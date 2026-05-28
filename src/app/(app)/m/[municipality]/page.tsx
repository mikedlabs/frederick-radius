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
import Image from "next/image";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
import TownStrip from "@/components/municipality/TownStrip";

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

  // Town hero — each town now gets its OWN identifiable photo
  // instead of a daily-rotating aerial that looks the same in
  // every municipality. We pick the top-scored photographed place
  // in the town as the signature image (Brewer's Alley for
  // Frederick, the railroad bridge for Brunswick, etc — whichever
  // top-scored place actually has a Google photo). Attribution
  // shows on the hero so it reads as "here's a real place in
  // {town}" not "we slapped a generic photo here."
  //
  // SeasonalPhoto stays as the last-resort fallback for towns
  // that don't have any photographed places yet — and as a slot
  // we can override later by hardcoding a Wikimedia landmark
  // photo per town when one is verified.
  const placesWithPhotos = places.filter((p) => p.google_photo_url);
  const heroPlace = placesWithPhotos[0] ?? null;
  const heroPhotoUrl = heroPlace?.google_photo_url ?? null;

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />

      {/* Sibling-town nav — horizontal pill strip with the active
          town pinned first. Pre-launch the only way to switch towns
          was via /browse + search; this lets a user jump directly
          between municipalities while staying in the town-page
          mental model. */}
      <TownStrip activeSlug={m.slug} />

      {/* Photo hero — the place as a place, not a row. The image
          carries identity; the overlay carries facts. */}
      <header className="relative -mx-4 -mt-4 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-[var(--app-radius-lg)]">
        <div className="relative h-52 w-full sm:h-72">
          {heroPhotoUrl ? (
            <Image
              src={heroPhotoUrl}
              alt={`${heroPlace?.name ?? m.name} in ${m.name}, MD`}
              fill
              sizes="(max-width: 720px) 100vw, 720px"
              priority
              unoptimized
              className="object-cover"
            />
          ) : (
            <SeasonalPhoto
              season="auto"
              alt={`Frederick County (near ${m.name})`}
              priority
              sizes="(max-width: 720px) 100vw, 720px"
              className="absolute inset-0"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
          {heroPlace && (
            <span
              className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur"
              style={{
                background: "rgba(255,255,255,0.18)",
                color: "white",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
              }}
            >
              Photo · {heroPlace.name}
            </span>
          )}
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
