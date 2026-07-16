import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Calendar, Building2, Tag, ArrowRight, DoorOpen, Phone } from "lucide-react";
import { search, type SearchHit } from "@/lib/search";
import { primaryAnswerFor } from "@/lib/search/answer";
import { findDepartments, jurisdictionLabel, formatPhone } from "@/data/departments";
import { searchCivicActions } from "@/lib/search/civic";
import { CRAVING_BY_KEY } from "@/data/cravings";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import SearchInput from "@/components/search/SearchInput";
import CategoryIcon from "@/components/place/CategoryIcon";

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
    case "page":
      return {
        href: hit.page.href,
        title: hit.page.title,
        subtitle: hit.page.blurb,
        badge: { label: "Guide", color: "var(--app-brand-2)" },
        Icon: DoorOpen,
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

  // Answer-first: a query like "coffee open now near me" leads with a direct
  // answer that jumps to the nearest-open coffee, instead of only floating
  // coffee up a text list the user has to scan. The ranked list stays below.
  const answer = query ? primaryAnswerFor(query) : null;
  // Civic layer — the overlay has carried this since the North Star build,
  // but the full /search page didn't: "report a pothole" ranked a church
  // (stray token) with no county answer in sight. Departments with their
  // phone numbers + the county's own How-Do-I links lead the list.
  const govAnswers = query ? findDepartments(query) : [];
  const civicAnswers = query
    ? searchCivicActions(query, 2).filter((c) => !govAnswers.some((d) => d.website === c.href))
    : [];
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

      {/* Who to call / official links — the verified government layer, above
          the ranked list so a civic question is answered before any fuzzy
          place match. Phone numbers render on the card (tel: on mobile). */}
      {(govAnswers.length > 0 || civicAnswers.length > 0) && (
        <section aria-label="County and city answers" className="space-y-2">
          {govAnswers.map((d) => (
            <div
              key={d.slug}
              className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)", color: "var(--app-cool)" }}>
                  <Building2 className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[16px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{d.name}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{d.about}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {d.phone && (
                      <a href={`tel:${d.phone}`} className="tactile-interactive tap-44-y inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white" style={{ background: "var(--app-cool)" }}>
                        <Phone className="h-3 w-3" strokeWidth={2.5} aria-hidden /> {formatPhone(d.phone)}
                      </a>
                    )}
                    <a href={d.website} target="_blank" rel="noopener noreferrer" className="tactile-interactive tap-44-y inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
                      Open site <ArrowRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </a>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                      {jurisdictionLabel(d.jurisdiction)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {civicAnswers.map((c) => (
            <a
              key={c.id}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="tactile tactile-interactive flex min-h-[52px] items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-2.5"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
            >
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-brand-2) 14%, transparent)", color: "var(--app-brand-2)" }}>
                <Building2 className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{c.title}</span>
                <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>{c.subtitle}</span>
              </span>
              <ArrowRight aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} />
            </a>
          ))}
        </section>
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

      {query && hits.length === 0 && govAnswers.length === 0 && civicAnswers.length === 0 && (
        <div
          className="space-y-3 rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          <p>No results for &ldquo;{query}&rdquo;. Try a category, town, or shorter phrase.</p>
          <p>
            Looking for a county or city office?{" "}
            <Link href="/contacts" className="font-semibold underline underline-offset-2" style={{ color: "var(--app-ink-2)" }}>
              Every service and who to call
            </Link>
          </p>
        </div>
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
                hit.type === "page" ? hit.page.href :
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
