import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { CATEGORIES, CATEGORY_BY_SLUG } from "@/data/categories";
import { TAG_BY_SLUG } from "@/data/tags";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { rankPlaces, slimForList } from "@/lib/loaders/places";
import { isRecommendable } from "@/lib/relevance";
import PlaceCard from "@/components/place/PlaceCard";
import PlaceList from "@/components/place/PlaceList";
import PhotoMosaic from "@/components/today/PhotoMosaic";
import PageBloom from "@/components/ui/PageBloom";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
import SectionHeading from "@/components/ui/SectionHeading";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import CategoryView from "@/components/category/CategoryView";
import SetTownInline from "@/components/category/SetTownInline";
import { MUNICIPALITIES } from "@/data/municipalities";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import { itemListJsonLd, jsonLdScript } from "@/lib/seo/jsonld";

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
    alternates: { canonical: `/category/${slug}` },
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

  // Food trucks roam, so they don't live in the fixed-location places catalog
  // (a static pin would misstate where they are). Their home is the dedicated
  // roster at /food-trucks; send the category, intent, and craving links there.
  if (slug === "food-truck") redirect("/food-trucks");

  // C2: origin = home muni centroid > FREDERICK_CENTER.
  // The cookie is written by PreferencesPanel via setHomeMuni in
  // src/lib/personalize.ts so settings + this server-rendered page
  // share a single source of truth.
  const store = await cookies();
  const homeMuni = store.get("fr_home_muni")?.value ?? null;

  // Coffee is the context-aware category PATTERN (Pass 3). It proves a
  // category page can rank from the user's town for real, be honest when
  // it has no context, and surface small towns — instead of silently
  // ranking everything from downtown. Other categories stay on the legacy
  // layout below until the pattern is proven and rolled out.
  if (slug === "coffee") {
    return (
      <CategoryView
        category={{ slug: c.slug, name: c.name, color: c.color, blurb: c.blurb }}
        homeMuni={homeMuni}
      />
    );
  }

  const homeCentroid: LngLat | null = homeMuni
    ? (MUNICIPALITY_BY_SLUG[homeMuni]?.centroid ?? null)
    : null;
  const origin = homeCentroid ?? FREDERICK_CENTER;

  // slimForList drops google_photos[]/google_hours[] (no card renders them)
  // before the set crosses to the client PlaceList — ~1.4MB off big categories.
  const places = rankPlaces({ category: slug, origin }).map(slimForList);
  // Children plus cross-tree see_also doorways (Family → Playgrounds, which
  // lives under outdoors): a category has one parent, but hub pages whose
  // audience overlaps another branch still get the chip.
  const subs = [
    ...CATEGORIES.filter((x) => x.parent === c.slug),
    ...(c.see_also ?? [])
      .map((s) => CATEGORIES.find((x) => x.slug === s))
      .filter((x): x is (typeof CATEGORIES)[number] => Boolean(x)),
  ];
  // Recommendation eligibility: "Worth your time" + the photo wall are
  // PROMOTIONAL, so institutions (schools/daycares/admissions offices that
  // happen to carry this category) must not lead them. Browse below keeps
  // the full set — they stay findable, just not recommended. This is the
  // Family "school admissions office as a top kids' outing" fix.
  const recommendable = places.filter(isRecommendable);
  const placesWithPhotos = recommendable.filter((p) => p.google_photo_url);

  // Tag faceting (audit theme #2): turn the now-populated tags into a real
  // filter instead of buried metadata. Show only the curated, relevant tags
  // that actually appear in THIS category's set (>=3 places), ordered by how
  // many carry them, capped so the row stays scannable. PlaceList does the
  // client-side filtering.
  const FACET_CANDIDATES = [
    "dog-friendly", "outdoor", "indoor", "outdoor-seating", "family",
    "kids-6-12", "kids-0-5", "free", "live-music", "date-night", "year-round",
    // Structured Google amenities (populated by `npm run enrich:amenities`).
    // Each only appears when >=3 places in the category carry it, so these are
    // inert until the amenity data is fetched.
    "reservations", "takeout", "delivery", "groups", "restroom",
  ];
  const facetCounts = new Map<string, number>();
  for (const p of places) {
    const t = new Set(p.tags ?? []);
    for (const slug of FACET_CANDIDATES) if (t.has(slug)) facetCounts.set(slug, (facetCounts.get(slug) ?? 0) + 1);
  }
  const facetTags = [...facetCounts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([slug]) => ({ slug, name: TAG_BY_SLUG[slug]?.name ?? slug }));

  // C3: top 3 photo-backed picks lead the page. Falls back to the
  // top 3 by feature score if fewer than 3 places have photos.
  //
  // Curation/ranking fix (audit §1): the three hero picks are the page's ONE
  // answer to "where should I go," so they must lead with what's actually
  // usable now. rankPlaces blends quality + proximity + open, but a famous
  // spot's feature_score could still float it to the top while CLOSED and 10+
  // miles out — exactly what the audit caught on an "open-now aware" page.
  // Hoist OPEN places ahead of closed ones for the hero (a stable sort keeps
  // the existing quality+proximity order within each group, so the remaining
  // open picks are already the nearest/best). The full browse list below is
  // untouched — closed/far spots stay findable, just not the hero.
  const heroPool = placesWithPhotos.length >= 3 ? placesWithPhotos : recommendable;
  const topPicks = [...heroPool]
    .sort((a, b) => {
      const ac = a.open_status.state === "closed" ? 1 : 0;
      const bc = b.open_status.state === "closed" ? 1 : 0;
      return ac - bc;
    })
    .slice(0, 3);

  // A quiet "you are here" line so a user in Thurmont understands
  // why the picks are not downtown-Frederick-first. Only renders
  // when there is a home muni and it has a centroid.
  const fromLabel =
    homeMuni && MUNICIPALITY_BY_SLUG[homeMuni]
      ? `Ranked from ${MUNICIPALITY_BY_SLUG[homeMuni].name}`
      : null;

  // Structured data (June-9 audit P2): the category as a CollectionPage
  // with an ItemList of its top places, so category pages stop being
  // schema-invisible next to the place details they link.
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${c.name} in Frederick County`,
    description: c.blurb,
    mainEntity: itemListJsonLd(
      `${c.name} in Frederick County`,
      recommendable.slice(0, 20).map((p) => ({ name: p.name, path: `/places/${p.slug}` })),
    ),
  };

  return (
    <div className="relative space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionJsonLd) }}
      />
      <PageBloom variant="single" />

      {/* Curated aerial/seasonal county hero — OUR photography (Photo
          Policy), never a place's Google photo. Mirrors the /m town hero
          so the page leads with the county itself; eyebrow + serif title
          + blurb overlay a dark gradient. */}
      <header className="relative overflow-hidden rounded-[var(--app-radius-lg)]">
        <div className="relative h-44 w-full sm:h-56">
          <SeasonalPhoto
            season="auto"
            alt={`${c.name} across Frederick County`}
            priority
            kenBurns
            sizes="(max-width: 720px) 100vw, 720px"
            className="absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 sm:p-5">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
              <span
                style={{ background: c.color }}
                className="inline-block h-1.5 w-1.5 rounded-full"
                aria-hidden
              />
              Category · Frederick County
            </p>
            <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-tight text-white sm:text-[36px]">
              {c.name}
            </h1>
            <p className="font-serif text-[14px] italic leading-snug text-white/90 sm:text-[15px]">
              {c.blurb}
            </p>
          </div>
        </div>
      </header>
      {fromLabel ? (
        <p className="-mt-3 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {fromLabel}
        </p>
      ) : (
        /* Downtown-default fix (audit P0): when no home town is set, this page
           silently ranks from Downtown Frederick. Say so honestly and give a
           one-tap way to re-rank from the user's own town, instead of leaving
           an out-of-town reader to assume the app is broken. */
        <div
          className="-mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--app-radius-md)] border px-3 py-2"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
        >
          <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Showing all of Frederick County.
          </span>
          <SetTownInline
            municipalities={MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }))}
          />
        </div>
      )}

      {/* C3: editorial top picks lead the page instead of a stat block.
          Each card is a PlaceCard at default density. On mobile this
          reads as a small stack; on tablet+ it splits into a 3-up
          row via PlaceCard's responsive layout. */}
      {topPicks.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeading title="Worth your time" accent={c.color} />
          {/* Compact row cards — the SAME dense card /nearby and the browse
              list use — so the visual language stays consistent from Today
              through every listing surface, right up to the place page. (Was
              the fixed-width "tile" shelf-card, which read as oversized and
              out of place in a vertical stack.) */}
          <ul className="space-y-2">
            {topPicks.map((p) => (
              <li key={p.slug}>
                <PlaceCard place={p} variant="row" />
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
                  className="tap-44 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
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
          layout preference persists across surfaces via localStorage.

          COLLAPSED by default so the page lands at ~3-4 screens (top
          picks + refine + photo wall) instead of running on like a
          directory. The full list is preserved, one tap away — a user
          is never forced to scroll the whole category to leave. */}
      <CollapsibleSection
        title="Show all places"
        count={places.length}
        countLabel="places"
        storageKey={`fr.category.${slug}.browse`}
        defaultOpen={false}
      >
        <PlaceList
          places={places}
          initialLayout="list"
          facetTags={facetTags}
          emptyMessage="We are still seeding this category. Submit a place you love."
        />
      </CollapsibleSection>
    </div>
  );
}
