"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import PlaceCard from "@/components/place/PlaceCard";
import PlaceList from "@/components/place/PlaceList";
import SectionHeading from "@/components/ui/SectionHeading";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import CategorySection from "./CategorySection";
import CategoryBriefing from "./CategoryBriefing";
import {
  CATEGORY_INITIAL_PAGE_SIZE,
  type CategoryPageModel,
} from "@/lib/category/browse-contract";
import { getHomeMuni } from "@/lib/personalize";
import {
  getScope,
  scopeToParam,
  subscribeScopeChange,
} from "@/lib/scope";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

const HOME_COOKIE = "fr_home_muni";

function readHomeMuni(): string | null {
  const stored = getHomeMuni();
  if (stored) return stored;
  if (typeof document === "undefined") return null;
  try {
    const prefix = `${HOME_COOKIE}=`;
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
  } catch {
    return null;
  }
}

function rankingQuery(): { scope: string | null; home: string | null } {
  const scope = getScope();
  return {
    scope: scope ? scopeToParam(scope) : null,
    home: readHomeMuni(),
  };
}

function sameRanking(
  model: CategoryPageModel,
  scope: string | null,
  home: string | null,
): boolean {
  const scopedTown = scope && scope !== "county" && scope !== "nearme" ? scope : null;
  if (scopedTown) return model.filterMuni === scopedTown;
  if (scope === "county") return model.filterMuni == null && model.originSource !== "home";
  if (home) return model.filterMuni == null && model.rankingMuni === home;
  return model.filterMuni == null && model.rankingMuni == null;
}

async function fetchCategoryModel(
  slug: string,
  query: {
    scope?: string | null;
    home?: string | null;
    offset?: number;
    limit?: number;
    tags?: string[];
  },
): Promise<CategoryPageModel> {
  const params = new URLSearchParams();
  if (query.scope) params.set("scope", query.scope);
  if (query.home) params.set("home", query.home);
  if (query.offset) params.set("offset", String(query.offset));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.tags?.length) params.set("tags", query.tags.join(","));
  const response = await fetch(`/api/category/${encodeURIComponent(slug)}/places?${params}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`category-browse-${response.status}`);
  }
  return (await response.json()) as CategoryPageModel;
}

export function CategoryDirectory({
  model,
  storageKey,
}: {
  model: CategoryPageModel;
  storageKey: string;
}) {
  const [places, setPlaces] = useState(model.places);
  const [totalCount, setTotalCount] = useState(model.totalCount);
  const [facetTags, setFacetTags] = useState(model.facetTags);
  const [activeFacets, setActiveFacets] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setPlaces(model.places);
    setTotalCount(model.totalCount);
    setFacetTags(model.facetTags);
    setActiveFacets([]);
  }, [model]);

  const loadMore = useCallback(async () => {
    if (loadingMore || places.length >= totalCount) return;
    setLoadingMore(true);
    try {
      const { scope, home } = rankingQuery();
      const next = await fetchCategoryModel(model.slug, {
        scope,
        home,
        offset: places.length,
        limit: CATEGORY_INITIAL_PAGE_SIZE,
        tags: activeFacets,
      });
      setPlaces((current) => {
        const seen = new Set(current.map((place) => place.slug));
        return [...current, ...next.places.filter((place) => !seen.has(place.slug))];
      });
      setTotalCount(next.totalCount);
    } catch {
      // The already-rendered page stays usable if the continuation fails.
    } finally {
      setLoadingMore(false);
    }
  }, [activeFacets, loadingMore, model.slug, places.length, totalCount]);

  const handleFacets = useCallback(
    async (nextFacets: string[]) => {
      setActiveFacets(nextFacets);
      setLoadingMore(true);
      try {
        const { scope, home } = rankingQuery();
        const next = await fetchCategoryModel(model.slug, {
          scope,
          home,
          offset: 0,
          limit: CATEGORY_INITIAL_PAGE_SIZE,
          tags: nextFacets,
        });
        setPlaces(next.places);
        setTotalCount(next.totalCount);
        setFacetTags(next.facetTags.length > 0 ? next.facetTags : facetTags);
      } catch {
        // Keep the current page if a facet request fails.
      } finally {
        setLoadingMore(false);
      }
    },
    [facetTags, model.slug],
  );

  if (model.townScopeIsEmpty) return null;

  return (
    <CollapsibleSection
      title={`All ${model.name.toLowerCase()}`}
      headingLevel={2}
      count={totalCount}
      countLabel="places"
      storageKey={storageKey}
      defaultOpen={false}
      mountOnOpen
    >
      <PlaceList
        places={places}
        totalCount={totalCount}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        onFacetsChange={handleFacets}
        initialLayout="list"
        facetTags={facetTags}
        pageSize={CATEGORY_INITIAL_PAGE_SIZE}
        emptyMessage="No places are listed in this category yet. You can suggest one through the place submission form."
      />
    </CollapsibleSection>
  );
}

const CategoryLiveContext = createContext<CategoryPageModel | null>(null);

export function CategoryLiveProvider({
  initial,
  children,
}: {
  initial: CategoryPageModel;
  children: ReactNode;
}) {
  const [model, setModel] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      const { scope, home } = rankingQuery();
      if (sameRanking(initial, scope, home)) {
        if (!cancelled) setModel(initial);
        return;
      }
      try {
        const next = await fetchCategoryModel(initial.slug, {
          scope,
          home,
          limit: CATEGORY_INITIAL_PAGE_SIZE,
        });
        if (!cancelled) setModel(next);
      } catch {
        if (!cancelled) setModel(initial);
      }
    };
    void apply();
    const unsubscribe = subscribeScopeChange(() => {
      void apply();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [initial]);

  return (
    <CategoryLiveContext.Provider value={model}>
      {children}
    </CategoryLiveContext.Provider>
  );
}

export function CategoryLiveCount({ initial }: { initial: CategoryPageModel }) {
  const model = useContext(CategoryLiveContext) ?? initial;
  if (model.townScopeIsEmpty) return null;
  return (
    <p className="mt-2 text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
      {model.totalCount} place{model.totalCount === 1 ? "" : "s"}
    </p>
  );
}

export function CategoryLiveBody({
  initial,
  children,
}: {
  initial: CategoryPageModel;
  children: ReactNode;
}) {
  const model = useContext(CategoryLiveContext) ?? initial;
  if (model === initial) return children;
  return <CategoryRenderedBody model={model} />;
}

export function CategoryRenderedBody({ model }: { model: CategoryPageModel }) {
  const town = model.rankingMuni
    ? (MUNICIPALITY_BY_SLUG[model.rankingMuni] ?? null)
    : null;

  if (model.coffee) {
    return (
      <>
        <CategoryBriefing
          categoryName={model.name}
          total={model.totalCount}
          openNowCount={model.coffee.openCount}
        />
        <CategorySection title="Start here" color={model.color} places={model.coffee.best} />
        <CategorySection title="Open now" color={model.color} places={model.coffee.openNow} />
        <CategorySection title="Local favorites" color={model.color} places={model.coffee.favs} />
        {town && (
          <CategorySection
            title={`Nearby ${town.name}`}
            color={model.color}
            places={model.coffee.nearby}
          />
        )}
        {model.coffee.county.length > 0 && (
          <CollapsibleSection
            title="Show across the county"
            headingLevel={2}
            count={model.coffee.county.length}
            countLabel="towns"
            storageKey={`fr.category.${model.slug}.county`}
            defaultOpen={false}
            mountOnOpen
          >
            <ul className="space-y-2.5">
              {model.coffee.county.map((group) => {
                const municipality = MUNICIPALITY_BY_SLUG[group.municipality];
                return (
                  <li key={group.municipality}>
                    <p
                      className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {municipality?.name ?? group.municipality}
                    </p>
                    {group.places[0] ? (
                      <PlaceCard place={group.places[0]} variant="row" />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CollapsibleSection>
        )}
        <CategoryDirectory model={model} storageKey={`fr.category.${model.slug}.full`} />
      </>
    );
  }

  return (
    <>
      {model.townScopeIsEmpty && (
        <section className="space-y-2.5">
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
            Nothing is listed under {model.name.toLowerCase()} in {model.scopedTownName} yet.
          </p>
          {model.countyFallback.length > 0 && (
            <>
              <SectionHeading title="Nearest across the county" accent={model.color} />
              <ul className="space-y-2">
                {model.countyFallback.map((place) => (
                  <li key={place.slug}>
                    <PlaceCard place={place} variant="row" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {model.topPicks.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeading title="Start here" accent={model.color} />
          <ul className="space-y-2">
            {model.topPicks.map((place) => (
              <li key={place.slug}>
                <PlaceCard place={place} variant="row" />
              </li>
            ))}
          </ul>
        </section>
      )}
      {model.subs.length > 0 && (
        <section className="space-y-2">
          <h2
            className="text-xs font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Browse by type
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {model.subs.map((sub) => (
              <li key={sub.slug}>
                <a
                  href={`/category/${sub.slug}`}
                  className="tap-44 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: sub.color }} />
                  {sub.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CategoryDirectory model={model} storageKey={`fr.category.${model.slug}.browse`} />
    </>
  );
}
