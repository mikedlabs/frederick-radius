import { MUNICIPALITIES } from "@/data/municipalities";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ScopeBar from "@/components/nav/ScopeBar";
import type { DecisionOriginSource } from "@/lib/scope";
import {
  buildCategoryPageModel,
  resolveCategoryRankingContext,
  type CategoryPageModel,
} from "@/lib/category/browse";
import {
  CategoryLiveBody,
  CategoryRenderedBody,
} from "./CategoryLive";

/**
 * CategoryView — the context-aware category pattern currently used by Coffee.
 * It remains reusable for other leaf categories once their existing facets
 * and navigation can move without losing useful browsing paths.
 *
 * The first HTML response is the county-wide guide so the route can stay on
 * ISR. A selected town or saved home is applied after hydration from the
 * cacheable category continuation API.
 */
export default function CategoryView({
  category,
  rankingMuni,
  filterMuni,
  originSource,
  model: providedModel,
}: {
  category: { slug: string; name: string; color: string; blurb: string };
  /** Effective town used as the ranking origin; may come from saved home. */
  rankingMuni: string | null;
  /** Hard boundary from a deliberately selected town scope only. */
  filterMuni: string | null;
  originSource: DecisionOriginSource;
  model?: CategoryPageModel;
}) {
  const model =
    providedModel ??
    buildCategoryPageModel(
      category.slug,
      resolveCategoryRankingContext(
        filterMuni ? `town:${filterMuni}` : originSource === "county" ? "county" : null,
        rankingMuni,
      ),
    );
  if (!model) return null;

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

      <ScopeBar
        current={model.rankingMuni}
        selectedTown={model.filterMuni}
        municipalities={municipalities}
      />

      <CategoryLiveBody initial={model}>
        <CategoryRenderedBody model={model} />
      </CategoryLiveBody>
    </div>
  );
}
