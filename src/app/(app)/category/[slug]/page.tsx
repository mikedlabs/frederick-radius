import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_BY_SLUG,
  categoryRouteOverride,
  isAmenityCategory,
} from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import ScopeBar from "@/components/nav/ScopeBar";
import { itemListJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import {
  buildCategoryPageModel,
  resolveCategoryRankingContext,
} from "@/lib/category/browse";
import {
  CategoryLiveBody,
  CategoryRenderedBody,
} from "@/components/category/CategoryLive";
import CategoryView from "@/components/category/CategoryView";

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
 * The first HTML response is the county-wide directory: a short first page
 * of places, with no request cookie read, so the route can ISR at the edge.
 * A saved town or home lens is applied after hydration through the cacheable
 * /api/category/[slug]/places continuation.
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

  const ranking = resolveCategoryRankingContext(null, null);
  const model = buildCategoryPageModel(slug, ranking);
  if (!model) notFound();

  if (slug === "coffee") {
    return (
      <CategoryView
        category={{ slug: c.slug, name: c.name, color: c.color, blurb: c.blurb }}
        rankingMuni={model.rankingMuni}
        filterMuni={model.filterMuni}
        originSource={model.originSource}
        model={model}
      />
    );
  }

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${c.name} in Frederick County`,
    description: c.blurb,
    mainEntity: itemListJsonLd(
      `${c.name} in Frederick County`,
      model.topPicks.map((p) => ({ name: p.name, path: `/places/${p.slug}` })),
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
        {!model.townScopeIsEmpty && (
          <p className="mt-2 text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {model.totalCount} place{model.totalCount === 1 ? "" : "s"}
          </p>
        )}
      </header>
      <ScopeBar
        current={model.rankingMuni}
        selectedTown={model.filterMuni}
        municipalities={MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }))}
      />

      <CategoryLiveBody initial={model}>
        <CategoryRenderedBody model={model} />
      </CategoryLiveBody>
    </div>
  );
}
