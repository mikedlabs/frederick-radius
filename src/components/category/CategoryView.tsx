import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import { rankPlaces } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import {
  bestMatches,
  openNowOf,
  localFavoritesOf,
  nearestFrom,
  groupByMunicipality,
  bestMatchReasons,
} from "@/lib/category-ranking";
import PlaceCard from "@/components/place/PlaceCard";
import PlaceList from "@/components/place/PlaceList";
import PageBloom from "@/components/ui/PageBloom";
import SectionHeading from "@/components/ui/SectionHeading";
import CategoryBriefing from "./CategoryBriefing";
import CategorySection from "./CategorySection";

/**
 * CategoryView — the context-aware category pattern. Coffee is the first
 * surface on it (Pass 3); other categories stay on the legacy layout until
 * this proves out. Reusable: it takes any category + the resolved home
 * town and renders the full answer spine.
 *
 * The point this proves: the page ranks from the user's town for real
 * (Best matches uses the balanced `categoryScore`), it is honest when it
 * has no context ("Using Downtown Frederick as the default"), and it makes
 * small towns visible without digging ("Across the county").
 */
export default function CategoryView({
  category,
  homeMuni,
}: {
  category: { slug: string; name: string; color: string; blurb: string };
  /** Resolved from the `fr_home_muni` cookie by the page; null = unknown. */
  homeMuni: string | null;
}) {
  const town = homeMuni ? (MUNICIPALITY_BY_SLUG[homeMuni] ?? null) : null;
  const origin: LngLat = town?.centroid ?? FREDERICK_CENTER;
  const ctx = { town: town?.slug ?? null };

  // One ranked, distance-decorated set from the resolved origin; every
  // section is a pure slice of it (no second loader pass).
  const all = rankPlaces({ category: category.slug, origin });
  const total = all.length;
  const openCount = all.filter((p) => isOpenNow(p.open_status)).length;

  const best = bestMatches(all, ctx, 6);
  const bestSlugs = new Set(best.map((p) => p.slug));
  const notBest = (list: typeof all) => list.filter((p) => !bestSlugs.has(p.slug));

  const openNow = notBest(openNowOf(all)).slice(0, 6);
  const favs = notBest(localFavoritesOf(all, ctx)).slice(0, 6);
  const nearby = notBest(nearestFrom(all)).slice(0, 6);

  // Across the county: every town EXCEPT the user's (or downtown when no
  // town is set), one top pick each — the anti-downtown-bias section.
  const homeSlug = town?.slug ?? "frederick";
  const county = groupByMunicipality(all, ctx)
    .filter((g) => g.municipality !== homeSlug)
    .slice(0, 8);

  const municipalities = MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }));

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />

      <header className="space-y-2">
        <p
          className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em]"
          style={{ color: category.color }}
        >
          <span
            style={{ background: category.color }}
            className="inline-block h-1.5 w-1.5 rounded-full"
            aria-hidden
          />
          Category
        </p>
        <h1
          className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {category.name} in Frederick County
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {category.blurb}
        </p>
      </header>

      <CategoryBriefing
        categoryName={category.name}
        total={total}
        openNowCount={openCount}
        town={town ? { slug: town.slug, name: town.name } : null}
        color={category.color}
        municipalities={municipalities}
      />

      <CategorySection
        title="Best matches"
        color={category.color}
        places={best}
        variant="tile"
        reasons={(p) => bestMatchReasons(p, ctx)}
      />

      <CategorySection title="Open now" color={category.color} places={openNow} />

      <CategorySection title="Local favorites" color={category.color} places={favs} />

      {/* Nearby only renders when we know where "near" is — otherwise the
          briefing's set-town prompt is the honest substitute. */}
      {town && <CategorySection title={`Nearby ${town.name}`} color={category.color} places={nearby} />}

      {county.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeading title="Across the county" accent={category.color} />
          <ul className="space-y-2.5">
            {county.map((g) => {
              const m = MUNICIPALITY_BY_SLUG[g.municipality];
              return (
                <li key={g.municipality}>
                  <p
                    className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {m?.name ?? g.municipality}
                  </p>
                  <PlaceCard place={g.places[0]} variant="row" />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading title="Full browse" accent={category.color} />
        <PlaceList
          places={all}
          initialLayout="list"
          emptyMessage="We are still seeding this category. Submit a place you love."
        />
      </section>
    </div>
  );
}
