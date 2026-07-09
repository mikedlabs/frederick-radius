import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Calendar, Building2, Tag } from "lucide-react";
import { search, type SearchHit } from "@/lib/search";
import SearchInput from "@/components/search/SearchInput";

export const metadata: Metadata = {
  alternates: { canonical: "/search" },
  title: "Search",
  description: "Search Frederick County for places, events, towns, and categories.",
};

/**
 * /search — one ranked list.
 *
 * The previous design partitioned hits into Towns / Categories / Places /
 * Events sections, four parallel scans for the user. That made the page
 * read as four directories stacked, not "the answer to my query." This
 * version uses the same search core (with the same score) but renders
 * a single ranked list where each row tags its own type via a small
 * chip. The user scans top-to-bottom; the most relevant match wins
 * regardless of what kind of thing it is.
 *
 * Display contract per row:
 *   - Type chip (place / event / town / category) at left
 *   - Title (single line, truncated)
 *   - One-line subtitle (category for places, venue for events,
 *     description for towns / categories)
 *   - Whole row is a single tap target into the canonical detail
 *     page (/places/[slug], /events/[slug], /m/[slug], /category/[slug])
 *
 * No PlaceCard / EventCard here — the search row is its own tighter
 * unit purpose-built for ranked results. Saves bytes and gives the
 * scan a consistent rhythm.
 */

type Display = {
  href: string;
  title: string;
  subtitle: string;
  badge: { label: string; color: string };
  Icon: typeof MapPin;
};

function displayFor(hit: SearchHit): Display {
  switch (hit.type) {
    case "place":
      return {
        href: `/places/${hit.place.slug}`,
        title: hit.place.name,
        subtitle: [hit.place.category, hit.place.city].filter(Boolean).join(" · "),
        badge: { label: "Place", color: "var(--app-brand)" },
        Icon: MapPin,
      };
    case "event":
      return {
        href: `/events/${hit.event.slug}`,
        title: hit.event.title,
        subtitle: hit.event.venue_name || hit.event.municipality,
        badge: { label: "Event", color: "var(--app-cool)" },
        Icon: Calendar,
      };
    case "municipality":
      return {
        href: `/m/${hit.municipality.slug}`,
        title: hit.municipality.name,
        subtitle: hit.municipality.hero_blurb || hit.municipality.description,
        badge: { label: "Town", color: "var(--app-brand-2)" },
        Icon: Building2,
      };
    case "category":
      return {
        href: `/category/${hit.category.slug}`,
        title: hit.category.name,
        subtitle: hit.category.blurb,
        badge: { label: "Category", color: "var(--app-accent-press)" },
        Icon: Tag,
      };
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  // `search()` already sorts by score descending — keep that order.
  // Cap at 50 results to keep the page scannable; if more rows match
  // a power user can refine the query.
  const hits = query ? search(query, 50) : [];
  // Mark the exception, not the rule: a query like "coffee" returns ~45
  // places plus a stray event, and stamping every row with an identical
  // "PLACE" pill is badge noise that steals ~70px of title width (the
  // colored icon already carries the type). Rows of the DOMINANT type drop
  // the pill; only rows of a different kind keep their label — so a
  // homogeneous list shows none at all (typography over badges).
  const typeCounts = new Map<string, number>();
  for (const h of hits) typeCounts.set(h.type, (typeCounts.get(h.type) ?? 0) + 1);
  const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1
          className="font-serif text-[24px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Search
        </h1>
        <SearchInput defaultValue={query} />
      </header>

      {!query && (
        <div className="space-y-3">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Try asking
          </p>
          {/* Answer-style prompts — the same "Ask Radius" register as Today.
              Each one ROUTES to a real surface that actually answers it
              (a curated collection, a category, the weekend view, open-now
              on the map) rather than running a dead text query. Only intents
              with an honest destination are listed — no prompt that leads to
              an empty result. */}
          <ul className="flex flex-wrap gap-2">
            {[
              { label: "I have 90 minutes downtown", href: "/collections/frederick-without-a-plan" },
              { label: "A rain plan", href: "/collections/rainy-day-frederick" },
              { label: "Out with the kids", href: "/collections/kid-energy-burners" },
              { label: "Walkable date night", href: "/collections/walkable-date-night" },
              { label: "Hidden gems", href: "/collections/hidden-gems" },
              { label: "What's on this weekend", href: "/events?lens=weekend" },
              { label: "Coffee near me", href: "/category/coffee" },
              { label: "What's open right now", href: "/open-now" },
            ].map((p) => (
              <li key={p.label}>
                <Link
                  href={p.href}
                  className="tactile tactile-interactive inline-flex items-center rounded-full px-3.5 py-2 text-[13px] font-semibold"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {query && hits.length === 0 && (
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          No results for &ldquo;{query}.&rdquo; Try a category, town, or shorter phrase.
        </p>
      )}

      {hits.length > 0 && (
        <section className="space-y-2" aria-label={`${hits.length} results for ${query}`}>
          <p
            className="eyebrow"
            style={{ color: "var(--app-ink-3)" }}
          >
            {hits.length} {hits.length === 1 ? "match" : "matches"}
          </p>
          <ul className="reveal-up space-y-1.5">
            {hits.map((hit) => {
              const d = displayFor(hit);
              const Icon = d.Icon;
              const key = `${hit.type}:${
                hit.type === "place" ? hit.place.slug :
                hit.type === "event" ? hit.event.slug :
                hit.type === "municipality" ? hit.municipality.slug :
                hit.category.slug
              }`;
              return (
                <li key={key}>
                  <Link
                    href={d.href}
                    className="tactile tactile-interactive flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3.5 py-2.5 transition"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ background: `color-mix(in srgb, ${d.badge.color} 14%, transparent)` }}
                    >
                      <Icon
                        className="h-4 w-4"
                        strokeWidth={2}
                        style={{ color: d.badge.color }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[14px] font-semibold leading-tight"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {d.title}
                      </span>
                      {d.subtitle && (
                        <span
                          className="block truncate text-[12px]"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {d.subtitle}
                        </span>
                      )}
                    </span>
                    {hit.type !== dominantType && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]"
                        style={{
                          background: `color-mix(in srgb, ${d.badge.color} 10%, transparent)`,
                          color: d.badge.color,
                        }}
                      >
                        {d.badge.label}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
