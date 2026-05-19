import type { Metadata } from "next";
import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { search } from "@/lib/search";
import PlaceBrowser from "@/components/place/PlaceBrowser";
import EventCard from "@/components/event/EventCard";
import SearchInput from "@/components/search/SearchInput";
import SectionHeading from "@/components/ui/SectionHeading";
import { decoratePlace } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export const metadata: Metadata = {
  title: "Search",
  description: "Search Frederick County for places, events, towns, and categories.",
};

const SUGGESTIONS = ["coffee", "live music", "park", "brewery", "antiques", "kid friendly", "rainy day"];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const hits = query ? search(query) : [];

  const placeCards = hits
    .filter((h) => h.type === "place")
    .map((h) => (h.type === "place" ? decoratePlace(h.place) : null))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const events = hits.filter((h) => h.type === "event");
  const munis = hits.filter((h) => h.type === "municipality");
  const cats = hits.filter((h) => h.type === "category");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Find anything in the county</p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Search
        </h1>
        <SearchInput defaultValue={query} />
      </header>

      {!query && (
        <section className="space-y-2">
          <p className="eyebrow">Try</p>
          <ul className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <Link
                  href={`/search?q=${encodeURIComponent(s)}`}
                  className="tactile inline-block rounded-full bg-[var(--app-bg-elevated)] px-3.5 py-1.5 text-[13px] font-medium transition active:scale-[0.97]"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {query && hits.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] px-4 py-12 text-center">
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--app-brand) 12%, transparent)", color: "var(--app-brand)" }}
          >
            <SearchIcon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
          </span>
          <p className="font-serif text-[17px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Nothing for &ldquo;{query}&rdquo;
          </p>
          <p className="max-w-xs text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            Try a category, a town, or a shorter phrase. Search covers
            places, events, towns, and categories.
          </p>
        </div>
      )}

      {munis.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title="Towns" count={munis.length} />
          <ul className="grid grid-cols-2 gap-2">
            {munis.map((h) => h.type === "municipality" && (
              <li key={h.municipality.slug}>
                <Link
                  href={`/m/${h.municipality.slug}`}
                  className="tactile tactile-interactive block rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)] p-3"
                >
                  <p className="font-serif text-base font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {h.municipality.name}
                  </p>
                  <p className="truncate text-xs" style={{ color: "var(--app-ink-3)" }}>
                    {h.municipality.hero_blurb}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cats.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title="Categories" count={cats.length} />
          <ul className="flex flex-wrap gap-1.5">
            {cats.map((h) => h.type === "category" && (
              <li key={h.category.slug}>
                <Link
                  href={`/category/${h.category.slug}`}
                  className="tactile inline-flex items-center gap-1.5 rounded-full bg-[var(--app-bg-elevated)] px-3.5 py-1.5 text-[13px] font-medium transition active:scale-[0.97]"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  <span aria-hidden style={{ color: h.category.color }}>●</span>
                  {h.category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {placeCards.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Places" count={placeCards.length} />
          <PlaceBrowser
            places={placeCards}
            emptyHint="No places match those filters. Clear them to see every match."
          />
        </section>
      )}

      {events.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Events" count={events.length} />
          <ul className="space-y-2">
            {events.map((h) => h.type === "event" && (
              <li key={h.event.slug}>
                <EventCard event={{
                  ...h.event,
                  distance_m: undefined,
                  category_name: CATEGORY_BY_SLUG[h.event.category]?.name ?? h.event.category,
                  municipality_name: MUNICIPALITY_BY_SLUG[h.event.municipality]?.name ?? h.event.municipality,
                }} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
