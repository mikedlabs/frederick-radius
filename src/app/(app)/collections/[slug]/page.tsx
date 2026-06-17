import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { COLLECTION_BY_SLUG, COLLECTIONS } from "@/data/collections";
import { getPlaceBySlug } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import PageBloom from "@/components/ui/PageBloom";

/**
 * /collections/[slug] — one curated list, rendered.
 *
 * Server component. Resolves the slug list against the canonical
 * place index at request time, drops anything that no longer
 * resolves (so renaming a place can never break a collection), and
 * renders the survivors as a vertical list of full-width PlaceCards.
 *
 * Order is array order — the curator's intent. The renderer never
 * re-sorts by distance or rating because that defeats the whole
 * point of a curated sequence.
 *
 * The hero block carries the same accent stripe as the index card,
 * so a returning user reads it as "this collection." A small "Back
 * to collections" breadcrumb sits at the top, mirroring /amenities
 * and /m/[slug].
 */

export const revalidate = 600;

export async function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = COLLECTION_BY_SLUG[slug];
  if (!c) return { title: "Collection not found" };
  return {
    title: c.title,
    description: c.blurb,
    alternates: { canonical: `/collections/${slug}` },
    openGraph: {
      title: c.title,
      description: c.blurb,
      type: "article",
      images: [
        {
          url: `/api/og?type=collection&slug=${slug}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: c.title,
      description: c.blurb,
      images: [`/api/og?type=collection&slug=${slug}`],
    },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = COLLECTION_BY_SLUG[slug];
  if (!collection) notFound();

  // Resolve each curated slug. Anything that no longer resolves is
  // silently dropped so a renamed place can never 404 a whole page.
  const places = collection.places
    .map((s) => getPlaceBySlug(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/collections"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          All collections
        </Link>
      </nav>

      {/* Hero — accent stripe + serif title + blurb. Same visual
          language as the index card so the user recognizes the
          collection at first glance. */}
      <header
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-5"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(80% 110% at 0% 0%, color-mix(in srgb, ${collection.accent} 14%, transparent), transparent 60%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: collection.accent }}
        />
        <div className="relative space-y-2 pl-2">
          <p
            className="eyebrow"
            style={{ color: "var(--app-ink-3)" }}
          >
            A collection
          </p>
          <h1
            className="font-serif text-[28px] font-semibold leading-[1.05] tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {collection.title}
          </h1>
          <p
            className="text-[14px] leading-relaxed text-pretty"
            style={{ color: "var(--app-ink-2)" }}
          >
            {collection.blurb}
          </p>
        </div>
      </header>

      {places.length === 0 ? (
        // Defensive — if every slug got renamed at once, render an
        // honest note rather than an empty page.
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          This collection is being updated. Check back soon.
        </p>
      ) : (
        <ul className="space-y-3" aria-label={`${collection.title}, ${places.length} places`}>
          {places.map((p) => (
            <li key={p.slug}>
              <PlaceCard place={p} />
            </li>
          ))}
        </ul>
      )}

      <footer
        className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        Picked by a Frederick resident. Not paid placement. Have a place
        that belongs here?{" "}
        <a
          href="/submit/place"
          className="underline"
          style={{ color: "var(--app-cool)" }}
        >
          Tell us.
        </a>
      </footer>
    </div>
  );
}
