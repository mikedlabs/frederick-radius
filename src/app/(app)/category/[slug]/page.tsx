import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_BY_SLUG,
  categoryRouteOverride,
  isAmenityCategory,
} from "@/data/categories";
import { TAG_BY_SLUG } from "@/data/tags";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { rankPlaces, slimForList } from "@/lib/loaders/places";
import { isRecommendable } from "@/lib/relevance";
import PlaceCard from "@/components/place/PlaceCard";
import PlaceList from "@/components/place/PlaceList";
import SectionHeading from "@/components/ui/SectionHeading";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import CategoryView from "@/components/category/CategoryView";
import ScopeBar from "@/components/nav/ScopeBar";
import { MUNICIPALITIES } from "@/data/municipalities";
import type { LngLat } from "@/lib/geo";
import { resolveServerTownRankingContext } from "@/lib/scope";
import { itemListJsonLd, jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 600;

export async function generateStaticParams() {
  // Amenity categories redirect to /amenities, so don't prerender their dead
  // routes (they're excluded from the sitemap too — audit DQ-016).
  return CATEGORIES.filter(
    (c) => !isAmenityCategory(c.slug) && !categoryRouteOverride(c.slug),
  ).map((c) => ({ slug: c.slug }));
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
 * fr_home_muni cookie that PreferencesPanel writes). When no town can be
 * resolved, the page ranks county-wide by quality instead of quietly using a
 * downtown centroid while the interface says "all of Frederick County."
 *
 * C3: the generic StatStrip ("Places / Verified / Towns") that used
 * to sit above the photo wall is gone. Generic counts add no signal
 * to a category page. In its place: a "Worth your time" rail of the
 * top three relevance-led picks, with photos when the records have them.
 * The eyebrow + serif title + blurb stay as the editorial line.
 */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = CATEGORY_BY_SLUG[slug];
  if (!c) notFound();

  // Some taxonomy labels belong to another first-class surface: sports and
  // community are event intents, public art is a map overlay, food trucks roam,
  // and empty utility leaves have a useful parent/directory destination.
  const routeOverride = categoryRouteOverride(slug);
  if (routeOverride) redirect(routeOverride);

  // Amenity categories (restrooms, Wi-Fi, benches, drinking water, …) are map
  // layers, not directories: their category page resolves to zero places and
  // is a dead end. Send them to /amenities, their real home, instead (DQ-016).
  if (isAmenityCategory(slug)) redirect("/amenities");

  // C2: origin = browsing scope > home municipality centroid. A county or
  // unresolved near-me scope has no honest server-side point, so it receives
  // no distance origin; the client-side Today and Map routes carry a precise
  // cached device fix when the visitor has shared one.
  // The browsing scope (fr_scope, UX-02) is the session lens set from the
  // nav chip; fr_home_muni is the long-term home written by PreferencesPanel
  // via setHomeMuni. Preserve the SOURCE as well as the origin town: only a
  // deliberate town scope is allowed to hard-filter the inventory. A saved
  // home ranks nearby places first while keeping the rest of the county.
  const store = await cookies();
  const rankingContext = resolveServerTownRankingContext(
    store.get("fr_scope")?.value ?? null,
    store.get("fr_home_muni")?.value ?? null,
  );
  const homeMuni = rankingContext.originMunicipality;

  // Coffee uses the context-aware answer spine. Other category hubs retain
  // their subcategory navigation, facets, and collection metadata while
  // sharing the corrected normalized ranking below.
  if (slug === "coffee") {
    return (
      <CategoryView
        category={{ slug: c.slug, name: c.name, color: c.color, blurb: c.blurb }}
        rankingMuni={homeMuni}
        filterMuni={rankingContext.filterMunicipality}
        originSource={rankingContext.source}
      />
    );
  }

  const homeCentroid: LngLat | null = homeMuni
    ? (MUNICIPALITY_BY_SLUG[homeMuni]?.centroid ?? null)
    : null;
  const origin = homeCentroid ?? undefined;

  // slimForList drops google_photos[]/google_hours[] (no card renders them)
  // before the set crosses to the client PlaceList — ~1.4MB off big categories.
  const places = rankPlaces({
    category: slug,
    origin,
    originSource: rankingContext.source,
    municipality: rankingContext.filterMunicipality ?? undefined,
  }).map(slimForList);
  // A deliberate town scope hard-filters by design, but 43% of category-by-town
  // views resolve to ZERO places, and the page still drew its full furniture
  // around "0 places" (data audit 2026-08-18). When the town has nothing, say
  // so first, then surface the nearest county-wide answers below the honest
  // line: the town answer stays "none", and the reader still leaves with the
  // thing they came for. Ranked from the same town centroid, so "nearest"
  // means nearest to them. Only computed in the empty case.
  const scopedTownName = rankingContext.filterMunicipality
    ? MUNICIPALITY_BY_SLUG[rankingContext.filterMunicipality]?.name ?? null
    : null;
  const countyFallback =
    places.length === 0 && scopedTownName
      ? rankPlaces({ category: slug, origin, originSource: rankingContext.source })
          .map(slimForList)
          .filter(isRecommendable)
      : [];
  const townScopeIsEmpty = places.length === 0 && scopedTownName != null;
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

  // The hero is a recommendation, not a photo gallery. Preserve the real
  // relevance order even when the nearest useful place has no image; media
  // completeness must never promote a farther town above the user's area.
  const topPicks = [...recommendable]
    .sort((a, b) => {
      const ac = a.open_status.state === "closed" ? 1 : 0;
      const bc = b.open_status.state === "closed" ? 1 : 0;
      return ac - bc;
    })
    .slice(0, 3);

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
    <div className="relative space-y-5 sm:space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionJsonLd) }}
      />
      <nav aria-label="Breadcrumb">
        <Link
          href="/places"
          className="tap-44 inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
          style={{ color: "var(--app-ink-2)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          All places
        </Link>
      </nav>

      {/* A category is already a browsing tool; it does not need a second
          card-like hero around its title. The flat heading keeps the first
          viewport for the location control and useful recommendations. */}
      <header className="border-b pb-5" style={{ borderColor: "var(--app-border)" }}>
        <p className="eyebrow" style={{ color: `color-mix(in srgb, ${c.color} 72%, var(--app-ink))` }}>
          Frederick County guide
        </p>
        <h1 className="mt-1.5 font-serif text-[32px] font-semibold leading-[1.05] tracking-tight sm:text-[38px]" style={{ color: "var(--app-ink)" }}>
          {c.name}
        </h1>
        <p className="mt-2 max-w-[58ch] text-[14px] leading-relaxed sm:text-[15px]" style={{ color: "var(--app-ink-2)" }}>
          {c.blurb}
        </p>
        {/* "0 places" as page furniture reads like a broken app, not an
            answer. The town-empty state below carries the honest sentence
            instead. */}
        {!townScopeIsEmpty && (
          <p className="mt-2 text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {places.length} place{places.length === 1 ? "" : "s"}
          </p>
        )}
      </header>
      {/* The location control is ALWAYS shown and always changeable (beta
          feedback 2026-07-12: once a town was set, the old control vanished
          and left read-only "Ranked from X" with no way to change it). It
          writes the shared browsing scope, so it stays in sync with the nav
          chip and re-ranks everywhere. */}
      <ScopeBar
        current={homeMuni}
        selectedTown={rankingContext.filterMunicipality}
        municipalities={MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }))}
      />

      {/* The honest town-empty state. The town's answer is "none", said
          plainly and first; the nearest county-wide places follow so the
          reader still gets what they came for. The ScopeBar above remains
          the way to widen or change the town. */}
      {townScopeIsEmpty && (
        <section className="space-y-2.5">
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
            Nothing is listed under {c.name.toLowerCase()} in {scopedTownName} yet.
          </p>
          {countyFallback.length > 0 && (
            <>
              <SectionHeading title="Nearest across the county" accent={c.color} />
              <ul className="space-y-2">
                {countyFallback.slice(0, 3).map((p) => (
                  <li key={p.slug}>
                    <PlaceCard place={p} variant="row" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* C3: editorial top picks lead the page instead of a stat block.
          Each card is a PlaceCard at default density. On mobile this
          reads as a small stack; on tablet+ it splits into a 3-up
          row via PlaceCard's responsive layout. */}
      {topPicks.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeading title="Start here" accent={c.color} />
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
            Browse by type
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

      {/* Browse: PlaceList lets the visitor flip between a 2-up
          photo grid (visual) and a dense list (scannable). Category
          pages default to list because users land here intent-driven
          ("show me all the breweries") and want to compare. Their
          layout preference persists across surfaces via localStorage.

          COLLAPSED by default so the page lands at ~3-4 screens (top
          picks + refine + photo wall) instead of running on like a
          directory. The full list is preserved, one tap away — a user
          is never forced to scroll the whole category to leave. */}
      {/* A collapsed "All pharmacies (0)" under an already-stated empty town
          is furniture with nothing behind the door; skip it there. The
          county-empty case (no town scope, genuinely nothing) keeps the
          section so its suggest-a-place message stays reachable. */}
      {!townScopeIsEmpty && (
        <CollapsibleSection
          title={`All ${c.name.toLowerCase()}`}
          headingLevel={2}
          count={places.length}
          countLabel="places"
          storageKey={`fr.category.${slug}.browse`}
          defaultOpen={false}
        >
          <PlaceList
            places={places}
            initialLayout="list"
            facetTags={facetTags}
            emptyMessage="No places are listed in this category yet. You can suggest one through the place submission form."
          />
        </CollapsibleSection>
      )}
    </div>
  );
}
