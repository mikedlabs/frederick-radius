import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { FREDERICK_CENTER, type LngLat } from "@/lib/geo";
// eslint-disable-next-line no-restricted-imports -- SERVER component (no "use client"): loader imports render server-side and never enter the client bundle
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
import CategoryIcon from "@/components/place/CategoryIcon";
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
 * (the "Worth your time" lead uses the balanced `categoryScore`), it is honest when it
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

  // "Worth your time" is the LEAD: a tight 3-up tile row (mixed density, one
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

      {/* Typographic category hero — same as the default category page. A
          calm cream plate tinted by the category's own ink with its engraved
          glyph as a faint watermark, instead of a generic county aerial that
          read as irrelevant behind a specific category (e.g. a pool photo
          behind "Coffee"). */}
      <header
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{
          borderColor: `color-mix(in srgb, ${category.color} 30%, var(--app-border))`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${category.color} 14%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid))`,
          boxShadow: "var(--app-elev-1), var(--app-hi)",
        }}
      >
        <CategoryIcon
          slug={category.slug}
          className="pointer-events-none absolute -bottom-7 -right-5 h-40 w-40 sm:h-48 sm:w-48"
          style={{ color: `color-mix(in srgb, ${category.color} 15%, transparent)` }}
        />
        <div className="relative p-5 sm:p-6">
          <p
            className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: `color-mix(in srgb, ${category.color} 72%, var(--app-ink))` }}
          >
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: category.color }} />
            Category · Frederick County
          </p>
          <h1 className="mt-2 font-serif text-[30px] font-semibold leading-tight tracking-tight sm:text-[36px]" style={{ color: "var(--app-ink)" }}>
            {category.name}
          </h1>
          <p className="mt-1.5 max-w-[46ch] font-serif text-[14px] italic leading-snug sm:text-[15px]" style={{ color: "var(--app-ink-2)" }}>
            {category.blurb}
          </p>
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

      {/* Compact row cards (the default) so "Worth your time" matches the
          other sections and every other listing surface — no oversized
          fixed-width tiles breaking the rhythm on the way to a place. */}
      <CategorySection
        title="Worth your time"
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
