import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CATEGORIES, CATEGORY_BY_SLUG } from "@/data/categories";
import { rankPlaces } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import PhotoMosaic from "@/components/today/PhotoMosaic";
import PageBloom from "@/components/ui/PageBloom";
import StatStrip from "@/components/ui/StatStrip";
import SectionHeading from "@/components/ui/SectionHeading";
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

  const places = rankPlaces({ category: slug, origin: FREDERICK_CENTER });
  const subs = CATEGORIES.filter((x) => x.parent === c.slug);
  const placesWithPhotos = places.filter((p) => p.google_photo_url);
  const verifiedCount = places.filter((p) => p.is_verified).length;
  const townsCovered = new Set(places.map((p) => p.municipality).filter(Boolean)).size;

  const catStats = [
    { label: "Places", value: places.length },
    { label: "Verified", value: verifiedCount },
    { label: "Towns", value: townsCovered },
  ];

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />
      <header className="space-y-2">
        <p
          className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em]"
          style={{ color: c.color }}
        >
          <span style={{ background: c.color }} className="inline-block h-1.5 w-1.5 rounded-full" aria-hidden />
          Category
        </p>
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          {c.name} in Frederick County
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {c.blurb}
        </p>
      </header>

      <StatStrip stats={catStats} eyebrow={`Across the county`} />

      {subs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Refine
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {subs.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/category/${s.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  <span style={{ color: s.color }}>●</span>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Photo wall — six tiles from THIS category. The category
          tile section makes the page feel like browsing a curated
          collection, not a stacked list. */}
      {placesWithPhotos.length >= 4 && (
        <section className="space-y-3">
          <SectionHeading title={`Looks like ${c.name}`} accent={c.color} />
          <PhotoMosaic places={placesWithPhotos} />
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading
          title={`${places.length} place${places.length === 1 ? "" : "s"}`}
          accent={c.color}
        />
        {places.length === 0 ? (
          <p
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            We&apos;re still seeding this category. Submit a place you love.
          </p>
        ) : (
          <ul className="space-y-2">
            {places.map((p) => (
              <li key={p.slug}>
                <PlaceCard place={p} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
