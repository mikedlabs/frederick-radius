import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { COLLECTION_BY_SLUG, COLLECTIONS } from "@/data/collections";
import { getPlaceBySlug } from "@/lib/loaders/places";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { isLgbtqEvent } from "@/lib/events/lgbtq";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";

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

  // LGBTQ+ Frederick is places AND a calendar: The Frederick Center's
  // programming plus title-classified community events flow through the
  // one unified event set, so this section can never drift from /events.
  // Only this collection pays the assembly cost; the rest stay place-only.
  let communityEvents: Awaited<ReturnType<typeof assembleUnifiedEvents>>["publicEvents"] = [];
  if (slug === "lgbtq-frederick") {
    // eslint-disable-next-line react-hooks/purity -- request-time clock in an ISR server render, same posture as /live-music
    const now = Date.now();
    const { publicEvents } = await assembleUnifiedEvents(new Date(now));
    communityEvents = publicEvents
      .filter((e) => {
        const ms = Date.parse(e.starts_at);
        return Number.isFinite(ms) && ms >= now - 3_600_000 && isLgbtqEvent(e);
      })
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
      .slice(0, 8);
  }

  const firstPlaces = places.slice(0, 5);
  const morePlaces = places.slice(5);
  const firstCommunityEvents = communityEvents.slice(0, 3);
  const moreCommunityEvents = communityEvents.slice(3);

  return (
    <div className="relative space-y-5 sm:space-y-6">
      <nav aria-label="Breadcrumb">
        <Link
          href="/collections"
          className="tap-44 inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
          style={{ color: "var(--app-ink-2)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          All collections
        </Link>
      </nav>

      <header className="border-b pb-5" style={{ borderColor: "var(--app-border)" }}>
        <p className="eyebrow" style={{ color: collection.accent }}>Local field guide</p>
        <h1
          className="mt-1.5 font-serif text-[32px] font-semibold leading-[1.05] tracking-tight sm:text-[38px]"
          style={{ color: "var(--app-ink)" }}
        >
          {collection.title}
        </h1>
        <p className="mt-2 max-w-[58ch] text-[14px] leading-relaxed text-pretty sm:text-[15px]" style={{ color: "var(--app-ink-2)" }}>
          {collection.blurb}
        </p>
        <p className="mt-2 text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {places.length} place{places.length === 1 ? "" : "s"} · curated order
        </p>
      </header>

      {slug === "beer-around-frederick" && (
        <Link
          href="/beer"
          className="tap-44 flex items-center justify-between gap-3 border-y py-3.5 transition hover:bg-[var(--app-bg-sunken)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span>
            <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Looking for a specific beer?
            </span>
            <span className="block text-[13px]" style={{ color: "var(--app-ink-2)" }}>
              Search beers, breweries, styles, and the map.
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
            Find a beer <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
          </span>
        </Link>
      )}

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
        <section className="space-y-3" aria-labelledby="collection-places-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="collection-places-heading" className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              In this guide
            </h2>
            <span className="text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{places.length} places</span>
          </div>
          <ul className="space-y-2" aria-label={`${collection.title}, first ${firstPlaces.length} places`}>
            {firstPlaces.map((p) => (
              <li key={p.slug}>
                <PlaceCard place={p} variant="row" />
              </li>
            ))}
          </ul>
          {morePlaces.length > 0 ? (
            <details className="group border-t" style={{ borderColor: "var(--app-border)" }}>
              <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-brand-press)" }}>
                Show {morePlaces.length} more
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
              </summary>
              <ul className="space-y-2 pt-2" aria-label={`${collection.title}, more places`}>
                {morePlaces.map((p) => (
                  <li key={p.slug}><PlaceCard place={p} variant="row" /></li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      )}

      {slug === "lgbtq-frederick" && (
        <section className="space-y-3" aria-label="LGBTQ+ community events">
          <div className="flex items-baseline justify-between">
            <h2
              className="font-serif text-[20px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              On the calendar
            </h2>
            <Link
              href="/events?lgbtq=true"
              className="text-[13px] font-semibold hover:underline"
              style={{ color: "var(--app-brand-press)" }}
            >
              See the board <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
            </Link>
          </div>
          {firstCommunityEvents.length > 0 ? (
            <>
              <ul className="space-y-2.5">
              {firstCommunityEvents.map((e) => (
                <li key={`${e.slug}-${e.starts_at}`}>
                  <EventCard event={e} variant="glance" />
                </li>
              ))}
              </ul>
              {moreCommunityEvents.length > 0 ? (
                <details className="group border-t" style={{ borderColor: "var(--app-border)" }}>
                  <summary className="tap-44 flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-brand-press)" }}>
                    Show {moreCommunityEvents.length} more events
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="space-y-2 pt-2">
                    {moreCommunityEvents.map((e) => (
                      <li key={`${e.slug}-${e.starts_at}`}><EventCard event={e} variant="glance" /></li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : (
            <p
              className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-center text-[13px]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              No upcoming community events are in the guide right now.
            </p>
          )}
        </section>
      )}

      <footer className="border-t pt-4 text-[11.5px] leading-relaxed" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        These lists are selected locally and have no paid placement. If a place is missing, {" "}
        <Link
          href="/submit/place"
          className="tap-44 inline-flex min-h-11 items-center font-semibold underline"
          style={{ color: "var(--app-cool)" }}
        >
          Tell us
        </Link>
      </footer>
    </div>
  );
}
