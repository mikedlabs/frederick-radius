import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { eventsInMunicipality, nearTown, BY_TOWN_ENABLED } from "@/lib/loaders/events";
import { decoratePlace, publicPlacesByMunicipality } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import PhotoMosaic from "@/components/today/PhotoMosaic";
import PageBloom from "@/components/ui/PageBloom";
import StatStrip from "@/components/ui/StatStrip";
import SectionHeading from "@/components/ui/SectionHeading";
import { CATEGORIES, TOP_CATEGORIES } from "@/data/categories";

export const revalidate = 600;

// Friendly glyph per top category — same visual vocabulary as the
// place cards, so a town reads as pictures + color, not a list.
const TOP_GLYPH: Record<string, string> = {
  food: "🍴", outdoors: "🌲", arts: "🎭", shopping: "🛍", wellness: "💆",
  family: "👨‍👩‍👧", civic: "🏛", services: "🛠", lodging: "🏨", worship: "⛪",
};

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
  const verifiedCount = places.filter((p) => p.is_verified).length;

  // A real photo FROM this town for the hero (highest feature score
  // with a Google photo). Never stock or fabricated — if none, a
  // System-Black gradient carries the name instead.
  const heroPhoto = places.find((p) => p.google_photo_url)?.google_photo_url ?? null;

  const categoryCounts = TOP_CATEGORIES
    .map((c) => ({
      c,
      n: places.filter((p) => {
        const cat = CATEGORIES.find((x) => x.slug === p.category);
        return p.category === c.slug || cat?.parent === c.slug;
      }).length,
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  const placesWithPhotos = places.filter((p) => p.google_photo_url);
  const townStats = [
    { label: "Places", value: places.length },
    { label: "Verified", value: verifiedCount },
    { label: "Categories", value: categoryCounts.length },
    { label: "Events", value: upcomingEvents.length },
  ];

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />
      {/* Photo hero — image-forward, the town as a place not a row */}
      <header className="relative -mx-4 -mt-4 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-[var(--app-radius-lg)]">
        <div className="relative h-52 w-full sm:h-60">
          {heroPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- key-safe proxied Google photo; plain img avoids a domain allowlist
            <img src={heroPhoto} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="h-full w-full"
              style={{ background: "linear-gradient(150deg,#1A1A1A,#2A2A2A 60%,#3A2E1E)" }}
            />
          )}
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

      <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {m.description}
      </p>

      <StatStrip stats={townStats} eyebrow={`Across ${m.name}`} />

      {/* Visual category tiles — 2-up, tappable, color + glyph + count */}
      {categoryCounts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            Around {m.name}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {categoryCounts.map(({ c, n }) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="hover-lift relative flex items-center gap-3 overflow-hidden rounded-[var(--app-radius-md)] border p-3 transition"
                style={{
                  borderColor: "var(--app-border)",
                  background: `linear-gradient(135deg, ${c.color}1f, ${c.color}08)`,
                }}
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[20px]"
                  style={{ background: `${c.color}26` }}
                  aria-hidden
                >
                  {TOP_GLYPH[c.slug] ?? "📍"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    {c.name}
                  </span>
                  <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    {n} {n === 1 ? "place" : "places"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Worth your time — a 2-up PHOTO grid, not a stacked text list */}
      <section className="space-y-2.5">
        <SectionHeading
          title="Worth your time"
          count={places.length || undefined}
        />
        {places.length === 0 ? (
          <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
             style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            We&apos;re still seeding places for {m.name}. Check back soon, or submit a place you love.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {places.slice(0, 12).map((p) => (
              <PlaceCard key={p.slug} place={p} variant="grid" />
            ))}
          </div>
        )}
      </section>

      {/* Photo wall — six tiles from THIS town. The page-level
          identity beat: a column of pictures of a real place. */}
      {placesWithPhotos.length >= 4 && (
        <section className="space-y-3">
          <SectionHeading title={`Looks like ${m.name}`} />
          <PhotoMosaic places={placesWithPhotos} />
        </section>
      )}

      {/* Upcoming — kept tight (max 4); the page is about the place,
          not an event directory. */}
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
