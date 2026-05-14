import type { Metadata } from "next";
import Link from "next/link";
import { search } from "@/lib/search";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import SearchInput from "@/components/search/SearchInput";
import { decoratePlace } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export const metadata: Metadata = {
  title: "Search",
  description: "Search Frederick County for places, events, towns, and categories.",
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const hits = query ? search(query) : [];

  const places = hits.filter((h) => h.type === "place");
  const events = hits.filter((h) => h.type === "event");
  const munis = hits.filter((h) => h.type === "municipality");
  const cats = hits.filter((h) => h.type === "category");

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Search
        </h1>
        <SearchInput defaultValue={query} />
      </header>

      {!query && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Try
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {["coffee", "live music", "park", "brewery", "antiques", "kid friendly", "rainy day"].map((q) => (
              <li key={q}>
                <Link
                  href={`/search?q=${encodeURIComponent(q)}`}
                  className="inline-block rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  {q}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {query && hits.length === 0 && (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
           style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          No results for &ldquo;{query}.&rdquo; Try a category, town, or shorter phrase.
        </p>
      )}

      {munis.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Towns
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {munis.map((h) => h.type === "municipality" && (
              <li key={h.municipality.slug}>
                <Link
                  href={`/m/${h.municipality.slug}`}
                  className="block rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <p className="font-serif text-base font-semibold" style={{ color: "var(--app-ink)" }}>{h.municipality.name}</p>
                  <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>{h.municipality.hero_blurb}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cats.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Categories
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {cats.map((h) => h.type === "category" && (
              <li key={h.category.slug}>
                <Link
                  href={`/category/${h.category.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  <span style={{ color: h.category.color }}>●</span>
                  {h.category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {places.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Places · {places.length}
          </h2>
          <ul className="space-y-2">
            {places.map((h) => h.type === "place" && (
              <li key={h.place.slug}>
                <PlaceCard place={decoratePlace(h.place)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Events · {events.length}
          </h2>
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
