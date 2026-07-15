import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { MapPin, Calendar, Building2, Tag, ArrowRight, DoorOpen } from "lucide-react";
import { isEventSearchIntent, qualifiedSearch, type SearchHit } from "@/lib/search";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { primaryAnswerFor } from "@/lib/search/answer";
import { CRAVING_BY_KEY } from "@/data/cravings";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import SearchInput from "@/components/search/SearchInput";
import CategoryIcon from "@/components/place/CategoryIcon";
import { approxLocation } from "@/lib/ip-geo";
import { resolveDecisionContext, SCOPE_COOKIE } from "@/lib/scope";

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
  categorySlug?: string;
};

function displayFor(hit: SearchHit): Display {
  switch (hit.type) {
    case "place":
      return {
        href: `/places/${hit.place.slug}`,
        title: hit.place.name,
        // Display name, never the raw slug — "Ice cream & treats · Frederick",
        // not "ice-cream · Frederick".
        subtitle: [
          CATEGORY_BY_SLUG[hit.place.category]?.name ?? hit.place.category.replace(/-/g, " "),
          hit.place.city,
        ].filter(Boolean).join(" · "),
        badge: { label: "Place", color: CATEGORY_BY_SLUG[hit.place.category]?.color ?? "var(--app-brand)" },
        Icon: MapPin,
        categorySlug: hit.place.category,
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
  searchParams: Promise<{ q?: string; in?: string }>;
}) {
  const { q, in: scopeParam } = await searchParams;
  const query = (q ?? "").trim();
  const eventsPromise = query && isEventSearchIntent(query)
    ? assembleUnifiedEvents(new Date()).then((result) => result.publicEvents).catch(() => undefined)
    : Promise.resolve(undefined);
  const [cookieStore, approx, eventPool] = await Promise.all([
    cookies(),
    approxLocation(),
    eventsPromise,
  ]);
  const context = resolveDecisionContext({
    scopeRaw: scopeParam || cookieStore.get(SCOPE_COOKIE)?.value || null,
    homeMuniRaw: cookieStore.get("fr_home_muni")?.value ?? null,
    approximateOrigin: approx.origin,
    approximateStatus: approx.status,
  });
  // Recognized words are real constraints, not decorative intent copy:
  // category limits eligibility, open-now requires fresh verified hours, and
  // near-me sorts from an available origin (or says that it could not).
  const qualified = query
    ? qualifiedSearch(query, 50, eventPool, {
        origin: context.origin,
        municipality: context.filterMunicipality,
        contextLabel: context.label,
        fallbackReason: context.fallbackReason,
      })
    : null;
  const hits = qualified?.hits ?? [];
  const searchMeta = qualified?.meta ?? null;
  // Mark the exception, not the rule: a query like "coffee" returns ~45
  // places plus a stray event, and stamping every row with an identical
  // "PLACE" pill is badge noise that steals ~70px of title width (the
  // colored icon already carries the type). Rows of the DOMINANT type drop
  // the pill; only rows of a different kind keep their label — so a
  // homogeneous list shows none at all (typography over badges).
  const typeCounts = new Map<string, number>();
  for (const h of hits) typeCounts.set(h.type, (typeCounts.get(h.type) ?? 0) + 1);
  const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Answer-first: a query like "coffee open now near me" leads with a direct
  // answer that jumps to the nearest-open coffee, instead of only floating
  // coffee up a text list the user has to scan. The ranked list stays below.
  const answer = query ? primaryAnswerFor(query) : null;
  const answerColor = answer
    ? answer.key === "open-now"
      ? "var(--app-positive)"
      : CRAVING_BY_KEY[answer.key]?.color ?? "var(--app-brand)"
    : "var(--app-brand)";

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

      {searchMeta?.qualifiers.constrained && (
        <p className="text-[12px] font-medium" style={{ color: "var(--app-ink-3)" }}>
          {[
            searchMeta.qualifiers.categoryLabel,
            searchMeta.qualifiers.openNow ? "Confirmed open" : null,
            searchMeta.qualifiers.nearMe
              ? searchMeta.nearMeApplied
                ? `Nearest first${searchMeta.contextLabel ? ` · ${searchMeta.contextLabel}` : ""}`
                : searchMeta.fallbackReason === "outside-county"
                  ? "Location is outside Frederick County · not distance-ranked"
                  : "Location unavailable · not distance-ranked"
              : searchMeta.contextLabel && searchMeta.qualifiers.categoryLabel
                ? searchMeta.contextLabel
                : null,
          ].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Answer-first lead: the direct answer to an intent query, above the
          ranked list. Links to the nearest-open craving surface (or Open now). */}
      {answer && (
        <Link
          href={answer.href}
          aria-label={`${answer.label}: ${answer.kicker}`}
          className="tactile tactile-interactive flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
          style={{ borderColor: `color-mix(in srgb, ${answerColor} 34%, var(--app-border))`, background: "var(--app-bg-elevated)" }}
        >
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: `color-mix(in srgb, ${answerColor} 15%, transparent)`, color: answerColor }}
          >
            <DoorOpen className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-[17px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
              {answer.label}
            </span>
            <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              {answer.kicker}
            </span>
          </span>
          <ArrowRight aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: answerColor }} />
        </Link>
      )}

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
              { label: "Local favorites", href: "/collections/hidden-gems" },
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
          {searchMeta?.qualifiers.openNow
            ? `No ${searchMeta.qualifiers.categoryLabel?.toLowerCase() ?? "places"} have recently confirmed open hours right now.`
            : `No results for “${query}”. Try a category, town, or shorter phrase.`}
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
          <ul
            className="reveal-up overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
            style={{ borderColor: "var(--app-border)" }}
          >
            {hits.map((hit, index) => {
              const d = displayFor(hit);
              const Icon = d.Icon;
              const key = `${hit.type}:${
                hit.type === "place" ? hit.place.slug :
                hit.type === "event" ? hit.event.slug :
                hit.type === "municipality" ? hit.municipality.slug :
                hit.category.slug
              }`;
              return (
                <li key={key} style={index > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
                  <Link
                    href={d.href}
                    prefetch={false}
                    className="flex min-h-[60px] items-center gap-3 px-3.5 py-2.5 transition-[background-color,transform] duration-[var(--app-dur-fast)] hover:bg-[var(--app-bg-sunken)] active:scale-[0.995]"
                  >
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ background: `color-mix(in srgb, ${d.badge.color} 14%, transparent)` }}
                    >
                      {d.categorySlug ? (
                        <CategoryIcon
                          slug={d.categorySlug}
                          className="h-4 w-4"
                          strokeWidth={1.8}
                          style={{ color: d.badge.color }}
                        />
                      ) : (
                        <Icon
                          className="h-4 w-4"
                          strokeWidth={2}
                          style={{ color: d.badge.color }}
                        />
                      )}
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
                          color: "var(--app-ink-2)",
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
