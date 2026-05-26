import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { CATEGORIES, CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { rankPlaces } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import PlaceList from "@/components/place/PlaceList";
import PhotoMosaic from "@/components/today/PhotoMosaic";
import PageBloom from "@/components/ui/PageBloom";
import SectionHeading from "@/components/ui/SectionHeading";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";

export const revalidate = 600;

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const c = CATEGORY_BY_SLUG[slug];
  if (!c) return { title: "Category not found" };
  return {
    title: `${c.name} in Frederick County`,
    description: c.blurb,
    openGraph: {
      title: `${c.name} in Frederick County`,
      description: c.blurb,
      images: [{ url: `/api/og?type=category&slug=${slug}`, width: 1200, height: 630 }],
    },
  };
}

/**
 * /category/[slug] — single-category surface.
 *
 * C2: ranking origin is now the user's home town (via the
 * fr_home_muni cookie that PreferencesPanel writes) with a downtown
 * Frederick fallback. The previous version ranked from
 * FREDERICK_CENTER unconditionally, which made a user in Thurmont
 * see downtown picks at the top of every category list.
 *
 * C3: the generic StatStrip ("Places / Verified / Towns") that used
 * to sit above the photo wall is gone. Generic counts add no signal
 * to a category page. In its place: a "Worth your time" rail of the
 * top 3 photo-led picks, which IS what a user opens this page to
 * see. The eyebrow + serif title + blurb stay as the editorial line.
 */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = CATEGORY_BY_SLUG[slug];
  if (!c) notFound();

  // C2: origin = home muni centroid > FREDERICK_CENTER.
  // The cookie is written by PreferencesPanel via setHomeMuni in
  // src/lib/personalize.ts so settings + this server-rendered page
  // share a single source of truth.
  const store = await cookies();
  const homeMuni = store.get("fr_home_muni")?.value ?? null;
  const homeCentroid: LngLat | null = homeMuni
    ? (MUNICIPALITY_BY_SLUG[homeMuni]?.centroid ?? null)
    : null;
  const origin = homeCentroid ?? FREDERICK_CENTER;

  const places = rankPlaces({ category: slug, origin });
  const subs = CATEGORIES.filter((x) => x.parent === c.slug);
  const placesWithPhotos = places.filter((p) => p.google_photo_url);

  // C3: top 3 photo-backed picks lead the page. Falls back to the
  // top 3 by feature score if fewer than 3 places have photos.
  const topPicks = (placesWithPhotos.length >= 3
    ? placesWithPhotos
    : places
  ).slice(0, 3);

  // A quiet "you are here" line so a user in Thurmont understands
  // why the picks are not downtown-Frederick-first. Only renders
  // when there is a home muni and it has a centroid.
  const fromLabel =
    homeMuni && MUNICIPALITY_BY_SLUG[homeMuni]
      ? `Ranked from ${MUNICIPALITY_BY_SLUG[homeMuni].name}`
      : null;

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />
      <header className="space-y-2">
        <p
          className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em]"
          style={{ color: c.color }}
        >
          <span
            style={{ background: c.color }}
            className="inline-block h-1.5 w-1.5 rounded-full"
            aria-hidden
          />
          Category
        </p>
        <h1
          className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {c.name} in Frederick County
        </h1>
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          {c.blurb}
        </p>
        {fromLabel && (
          <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {fromLabel}
          </p>
        )}
      </header>

      {/* C3: editorial top picks lead the page instead of a stat block.
          Each card is a PlaceCard at default density. On mobile this
          reads as a small stack; on tablet+ it splits into a 3-up
          row via PlaceCard's responsive layout. */}
      {topPicks.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeading title="Worth your time" accent={c.color} />
          <ul className="grid gap-2 sm:grid-cols-3">
            {topPicks.map((p) => (
              <li key={p.slug}>
                <PlaceCard place={p} variant="tile" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {subs.length > 0 && (
        <section className="space-y-2">
          <h2
            className="text-xs font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Refine
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {subs.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/category/${s.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  <span style={{ color: s.color }}>●</span>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Photo wall: six tiles from this category. The wall makes
          the page feel like browsing a curated collection, not a
          stacked list. Only renders when there are enough photo-
          backed places to fill the grid. */}
      {placesWithPhotos.length >= 4 && (
        <section className="space-y-3">
          <SectionHeading title={`Looks like ${c.name}`} accent={c.color} />
          <PhotoMosaic places={placesWithPhotos} />
        </section>
      )}

      {/* Browse: PlaceList lets the visitor flip between a 2-up
          photo grid (visual) and a dense list (scannable). Category
          pages default to list because users land here intent-driven
          ("show me all the breweries") and want to compare. Their
          layout preference persists across surfaces via localStorage. */}
      <section className="space-y-3">
        <SectionHeading title="Browse" accent={c.color} />
        <PlaceList
          places={places}
          initialLayout="list"
          emptyMessage="We are still seeding this category. Submit a place you love."
        />
      </section>
    </div>
  );
}
