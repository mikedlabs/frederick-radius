import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORIES, CATEGORY_BY_SLUG } from "@/data/categories";
import { rankPlaces } from "@/lib/loaders/places";
import PlaceBrowser from "@/components/place/PlaceBrowser";
import CategoryIcon from "@/components/place/CategoryIcon";
import { FREDERICK_CENTER } from "@/lib/geo";

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

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = CATEGORY_BY_SLUG[slug];
  if (!c) notFound();

  // Decorated, ranked county-wide. PlaceBrowser then makes it findable
  // (sort + town + type + open-now + paged) instead of a flat wall.
  const places = rankPlaces({ category: slug, origin: FREDERICK_CENTER });

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <p className="eyebrow">Category</p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          {c.name}
        </h1>
        <p
          className="text-pretty text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          {c.blurb}
        </p>
      </header>

      {places.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] px-4 py-10 text-center">
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-full"
            style={{
              background: `color-mix(in srgb, ${c.color} 14%, transparent)`,
              color: c.color,
            }}
          >
            <CategoryIcon slug={c.slug} strokeWidth={1.75} className="h-6 w-6" style={{ color: c.color }} />
          </span>
          <p className="font-serif text-[16px] font-semibold" style={{ color: "var(--app-ink)" }}>
            This guide is still being built
          </p>
          <p className="max-w-xs text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            We are still mapping {c.name.toLowerCase()} across the county. Check back soon.
          </p>
        </div>
      ) : (
        <PlaceBrowser
          places={places}
          emptyHint={`No ${c.name.toLowerCase()} match those filters. Clear them to see all ${places.length}.`}
        />
      )}
    </div>
  );
}
