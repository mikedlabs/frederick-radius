import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
import { rankPlaces } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import { isRecommendable } from "@/lib/relevance";
import {
  selectCuratedStack,
  groupByMunicipality,
} from "@/lib/category-ranking";
import PlaceCard from "@/components/place/PlaceCard";
import PlaceList from "@/components/place/PlaceList";
import PageBloom from "@/components/ui/PageBloom";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
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
  // Recommendation eligibility: the promoted sections lead with `rec`,
  // which drops institutions (schools/daycares/admissions offices). Full
  // browse below keeps `all` — they stay findable, just not recommended.
  // (No-op for coffee; the rule is universal for the category pattern.)
  const rec = all.filter(isRecommendable);
  const total = all.length;
  const openCount = all.filter((p) => isOpenNow(p.open_status)).length;

  // Best matches is the LEAD: a tight 3-up tile row (mixed density — one
  // strong lead over the scannable rows below), not a 6-tile block that
  // reads at parity with the dense sections and doubles the mobile scroll.
  //
  // The curated stack uses PROGRESSIVE dedupe: a place that's open AND loved
  // AND nearby shows once, in the earliest section it earns, instead of
  // three times down the page. "Across the county" + "Full browse" below
  // stay the complete tail. See lib/category-ranking selectCuratedStack.
  const { best, openNow, favs, nearby } = selectCuratedStack(rec, ctx);

  // Across the county: every town EXCEPT the user's (or downtown when no
  // town is set), one top pick each — the anti-downtown-bias section.
  const homeSlug = town?.slug ?? "frederick";
  const county = groupByMunicipality(rec, ctx)
    .filter((g) => g.municipality !== homeSlug)
    .slice(0, 8);

  const municipalities = MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }));

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />

      {/* Curated aerial/seasonal county hero — matches the legacy category
          page and the /m town hero (Photo Policy: our photography). */}
      <header className="relative -mx-4 -mt-4 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-[var(--app-radius-lg)]">
        <div className="relative h-44 w-full sm:h-56">
          <SeasonalPhoto
            season="auto"
            alt={`${category.name} across Frederick County`}
            priority
            sizes="(max-width: 720px) 100vw, 720px"
            className="absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 sm:p-5">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
              <span
                style={{ background: category.color }}
                className="inline-block h-1.5 w-1.5 rounded-full"
                aria-hidden
              />
              Category · Frederick County
            </p>
            <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-tight text-white sm:text-[36px]">
              {category.name}
            </h1>
            <p className="font-serif text-[14px] italic leading-snug text-white/90 sm:text-[15px]">
              {category.blurb}
            </p>
          </div>
        </div>
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
      />

      <CategorySection title="Open now" color={category.color} places={openNow} />

      <CategorySection title="Local favorites" color={category.color} places={favs} />

      {/* Nearby only renders when we know where "near" is — otherwise the
          briefing's set-town prompt is the honest substitute. */}
      {town && <CategorySection title={`Nearby ${town.name}`} color={category.color} places={nearby} />}

      {/* ── The browsing tail — COLLAPSED by default so the page lands at
          ~3-4 screens (the curated stack above) instead of 8-10. "Across
          the county" and "Full browse" are preserved, one tap away, but a
          user is never forced to scroll the whole directory to leave. */}
      {county.length > 0 && (
        <CollapsibleSection
          title="Show across the county"
          count={county.length}
          countLabel="towns"
          storageKey={`fr.category.${category.slug}.county`}
          defaultOpen={false}
        >
          <ul className="space-y-2.5">
            {county.map((g) => {
              const m = MUNICIPALITY_BY_SLUG[g.municipality];
              return (
                <li key={g.municipality}>
                  <p
                    className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {m?.name ?? g.municipality}
                  </p>
                  <PlaceCard place={g.places[0]} variant="row" />
                </li>
              );
            })}
          </ul>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Browse everything"
        count={all.length}
        countLabel="places"
        storageKey={`fr.category.${category.slug}.full`}
        defaultOpen={false}
      >
        <PlaceList
          places={all}
          initialLayout="list"
          emptyMessage="We are still seeding this category. Submit a place you love."
        />
      </CollapsibleSection>
    </div>
  );
}
