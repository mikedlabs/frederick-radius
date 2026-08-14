import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
// eslint-disable-next-line no-restricted-imports -- SERVER component (no "use client"): loader imports render server-side and never enter the client bundle
import { rankPlaces, slimForList } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import { isRecommendable } from "@/lib/relevance";
import {
  selectCuratedStack,
  groupByMunicipality,
} from "@/lib/category-ranking";
import PlaceCard from "@/components/place/PlaceCard";
import PlaceList from "@/components/place/PlaceList";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import CategoryBriefing from "./CategoryBriefing";
import ScopeBar from "@/components/nav/ScopeBar";
import CategorySection from "./CategorySection";
import type { DecisionOriginSource } from "@/lib/scope";

/**
 * CategoryView — the context-aware category pattern currently used by Coffee.
 * It remains reusable for other leaf categories once their existing facets
 * and navigation can move without losing useful browsing paths.
 *
 * The point this proves: the page ranks from the user's town for real
 * (the "Worth your time" lead uses the balanced `categoryScore`), ranks by
 * quality across the county when it has no location context, and makes small
 * towns visible without digging ("Across the county").
 */
export default function CategoryView({
  category,
  rankingMuni,
  filterMuni,
  originSource,
}: {
  category: { slug: string; name: string; color: string; blurb: string };
  /** Effective town used as the ranking origin; may come from saved home. */
  rankingMuni: string | null;
  /** Hard boundary from a deliberately selected town scope only. */
  filterMuni: string | null;
  originSource: DecisionOriginSource;
}) {
  const town = rankingMuni
    ? (MUNICIPALITY_BY_SLUG[rankingMuni] ?? null)
    : null;
  // No location means no distance origin. Quietly substituting Downtown made
  // the page's countywide language false and promoted Frederick-city results
  // for every new visitor. rankPlaces already has a quality-first countywide
  // path when origin is undefined.
  const origin = town?.centroid;
  const ctx = {
    town: town?.slug ?? null,
    category: category.slug,
    originSource,
  };

  // One ranked, distance-decorated set from the resolved origin; every
  // section is a pure slice of it (no second loader pass).
  const all = rankPlaces({
    category: category.slug,
    origin,
    originSource,
    municipality: filterMuni ?? undefined,
  }).map(slimForList);
  // Recommendation eligibility: the promoted sections lead with `rec`,
  // which drops institutions (schools/daycares/admissions offices). Full
  // browse below keeps `all` — they stay findable, just not recommended.
  // (No-op for coffee; the rule is universal for the category pattern.)
  const rec = all.filter(isRecommendable);
  const total = all.length;
  const openCount = all.filter((p) => isOpenNow(p.open_status)).length;

  // "Worth your time" is the LEAD: a tight 3-up tile row (mixed density, one
  // strong lead over the scannable rows below), not a 6-tile block that
  // reads at parity with the dense sections and doubles the mobile scroll.
  //
  // The curated stack uses PROGRESSIVE dedupe: a place that's open AND loved
  // AND nearby shows once, in the earliest section it earns, instead of
  // three times down the page. "Across the county" + "Full browse" below
  // stay the complete tail. See lib/category-ranking selectCuratedStack.
  const { best, openNow, favs, nearby } = selectCuratedStack(rec, ctx);

  // Across the county: every town except the user's, one top pick each. With
  // no town context, do not silently treat Frederick City as home; include it
  // on equal terms with the rest of the county.
  const county = groupByMunicipality(rec, ctx)
    .filter((g) => !town || g.municipality !== town.slug)
    .slice(0, 8);

  const municipalities = MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }));

  return (
    <div className="relative space-y-5 sm:space-y-6">
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

      <header className="border-b pb-5" style={{ borderColor: "var(--app-border)" }}>
        <p className="eyebrow" style={{ color: `color-mix(in srgb, ${category.color} 72%, var(--app-ink))` }}>
          Frederick County guide
        </p>
        <h1 className="mt-1.5 font-serif text-[32px] font-semibold leading-[1.05] tracking-tight sm:text-[38px]" style={{ color: "var(--app-ink)" }}>
          {category.name}
        </h1>
        <p className="mt-2 max-w-[58ch] text-[14px] leading-relaxed sm:text-[15px]" style={{ color: "var(--app-ink-2)" }}>
          {category.blurb}
        </p>
      </header>

      {/* Where the page ranks from — always shown, always changeable, writes
          the shared scope (same control as the legacy category page + /open-now;
          2026-07-12 beta feedback). Replaces CategoryBriefing's old inline
          set-town, which vanished once a town was set. */}
      <ScopeBar
        current={rankingMuni}
        selectedTown={filterMuni}
        municipalities={municipalities}
      />

      <CategoryBriefing
        categoryName={category.name}
        total={total}
        openNowCount={openCount}
      />

      {/* Compact row cards (the default) so "Worth your time" matches the
          other sections and every other listing surface — no oversized
          fixed-width tiles breaking the rhythm on the way to a place. */}
      <CategorySection
        title="Start here"
        color={category.color}
        places={best}
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
          headingLevel={2}
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
        title={`All ${category.name.toLowerCase()}`}
        headingLevel={2}
        count={all.length}
        countLabel="places"
        storageKey={`fr.category.${category.slug}.full`}
        defaultOpen={false}
      >
        <PlaceList
          places={all}
          initialLayout="list"
          emptyMessage="No places are listed in this category yet. You can suggest one through the place submission form."
        />
      </CollapsibleSection>
    </div>
  );
}
