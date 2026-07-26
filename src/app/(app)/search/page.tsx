import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Calendar, Building2, Tag, ArrowLeft, ArrowRight, ChevronDown, DoorOpen, Phone, MessageCircleQuestion } from "lucide-react";
import { search, type SearchHit } from "@/lib/search";
import { primaryAnswerFor } from "@/lib/search/answer";
import { findDepartments, jurisdictionLabel, formatPhone } from "@/data/departments";
import {
  isHighConfidenceCivicIntent,
  searchCivicActions,
  shouldShowDepartmentAnswers,
} from "@/lib/search/civic";
import { CRAVING_BY_KEY } from "@/data/cravings";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import SearchInput from "@/components/search/SearchInput";
import CategoryIcon from "@/components/place/CategoryIcon";
import {
  withMapReturnTo,
  withMapSearchQuery,
} from "@/lib/map-return";

export const metadata: Metadata = {
  alternates: { canonical: "/search" },
  title: "Search",
  description: "Search Frederick County listings and events by name or area.",
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

function branchKey(hit: Extract<SearchHit, { type: "place" }>): string {
  return `${hit.place.name.trim().toLocaleLowerCase()}|${hit.place.city.trim().toLocaleLowerCase()}`;
}

/** The street portion is enough to distinguish two branches in the same town.
 *  Keep the full mailing address on the place page instead of stuffing it into
 *  every search row. */
function streetAddress(address: string): string {
  return (address.split(",", 1)[0] ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function displayFor(hit: SearchHit, showBranchAddress = false): Display {
  switch (hit.type) {
    case "place":
      return {
        href: `/places/${hit.place.slug}`,
        title: hit.place.name,
        // Display name, never the raw slug — "Ice cream & treats · Frederick",
        // not "ice-cream · Frederick".
        subtitle: [
          CATEGORY_BY_SLUG[hit.place.category]?.name ?? hit.place.category.replace(/-/g, " "),
          showBranchAddress ? streetAddress(hit.place.address) : "",
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
        badge: { label: "Town", color: "var(--app-cool)" },
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
        badge: { label: "Guide", color: "var(--app-brand)" },
        Icon: DoorOpen,
      };
  }
}

function keyFor(hit: SearchHit): string {
  return `${hit.type}:${
    hit.type === "place" ? hit.place.slug
      : hit.type === "event" ? hit.event.slug
        : hit.type === "municipality" ? hit.municipality.slug
          : hit.type === "page" ? hit.page.href
            : hit.category.slug
  }`;
}

function SearchResultRow({
  hit,
  dominantType,
  divided,
  showBranchAddress,
  mapReturnTo,
}: {
  hit: SearchHit;
  dominantType?: string;
  divided: boolean;
  showBranchAddress?: boolean;
  mapReturnTo?: string;
}) {
  const d = displayFor(hit, showBranchAddress);
  const Icon = d.Icon;
  const href =
    hit.type === "place" ? withMapReturnTo(d.href, mapReturnTo) : d.href;
  return (
    <li style={divided ? { borderTop: "1px solid var(--app-border)" } : undefined}>
      <Link
        href={href}
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
            <Icon className="h-4 w-4" strokeWidth={2} style={{ color: d.badge.color }} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            {d.title}
          </span>
          {d.subtitle && (
            <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
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
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; returnTo?: string }>;
}) {
  const { q, returnTo } = await searchParams;
  const query = (q ?? "").trim();
  const mapReturnHref = withMapSearchQuery(returnTo, query);
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
  // Answer-first: a query like "coffee open now near me" leads with a direct
  // answer that jumps to the nearest-open coffee, instead of only floating
  // coffee up a text list the user has to scan. The ranked list stays below.
  const inferredAnswer = query ? primaryAnswerFor(query) : null;
  // Civic layer — the overlay has carried this since the North Star build,
  // but the full /search page didn't: "report a pothole" ranked a church
  // (stray token) with no county answer in sight. Departments with their
  // phone numbers + the county's own How-Do-I links lead the list.
  const departmentCandidates = query ? findDepartments(query) : [];
  const civicCandidates = query ? searchCivicActions(query, 2) : [];
  const suppressLocalHits = isHighConfidenceCivicIntent(query, civicCandidates);
  // A one-word overlap is not a trustworthy resident-task answer. Keep the
  // official action row for complete civic intents; otherwise let a clearly
  // requested department fallback handle the question without inventing a
  // second, weak recommendation (for example, a water-bill link for "water
  // outage" or any government card for "water park").
  const civicAnswers = suppressLocalHits ? civicCandidates : [];
  // Department matching is intentionally broad for Ask routing, but the
  // visible search page only admits it when the query actually reads like a
  // civic task. This keeps Animal Control out of "dog friendly restaurant"
  // and similarly weak water/health/transit overlaps. When a specific
  // official action exists, it stands alone instead of being followed by a
  // vaguer department card.
  const govAnswers = shouldShowDepartmentAnswers(query, civicCandidates)
    ? departmentCandidates
    : [];
  // A COMPLETE civic task can replace fuzzy local matches. A weak department
  // overlap cannot: "water park", "health food", "bus station", and "dog
  // friendly restaurant" still need their valid places and guides.
  // A complete civic task must lead with its authoritative action. Generic
  // craving inference sees words like "food" or "liquor" inside license
  // questions; letting that card render first would route the user to nearby
  // restaurants or stores instead of the official licensing answer.
  const answer = suppressLocalHits ? null : inferredAnswer;
  const rankedHits = suppressLocalHits ? [] : hits;
  // A chain can have several branches in the same town. Add street context
  // only to those colliding rows; unique places keep the quieter category +
  // town subtitle.
  const branchCounts = new Map<string, number>();
  for (const hit of rankedHits) {
    if (hit.type !== "place") continue;
    const key = branchKey(hit);
    branchCounts.set(key, (branchCounts.get(key) ?? 0) + 1);
  }
  const duplicateBranches = new Set(
    [...branchCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  );
  const typeCounts = new Map<string, number>();
  for (const h of rankedHits) typeCounts.set(h.type, (typeCounts.get(h.type) ?? 0) + 1);
  const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const primaryHits = rankedHits.slice(0, 12);
  const remainingHits = rankedHits.slice(12);
  const answerColor = answer
    ? answer.key === "open-now"
      ? "var(--app-positive)"
      : CRAVING_BY_KEY[answer.key]?.color ?? "var(--app-brand)"
    : "var(--app-brand)";

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        {mapReturnHref && (
          <Link
            href={mapReturnHref}
            className="tap-44-y inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Back to the map
          </Link>
        )}
        <h1
          className="font-serif text-[24px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Search Frederick
        </h1>
        <SearchInput defaultValue={query} returnTo={mapReturnHref ?? undefined} />
      </header>

      {/* Generic "ask about this" CTA — suppressed when a direct answer lead is
          present below, so the view never stacks two brand-emphasis blocks
          (one primary action per view). */}
      {query && !answer ? (
        <Link
          href={`/ask?q=${encodeURIComponent(query)}`}
          className="tactile-interactive flex min-h-12 items-center gap-2.5 rounded-[var(--app-radius-md)] border px-3 py-2"
          style={{
            borderColor: "color-mix(in srgb, var(--app-brand) 28%, var(--app-border))",
            background: "color-mix(in srgb, var(--app-brand) 6%, var(--app-bg-elevated))",
          }}
        >
          <MessageCircleQuestion className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-brand-press)" }} aria-hidden />
          <span className="min-w-0 flex-1 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            Need a recommendation or a plan? Ask Radius about this.
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-brand-press)" }} aria-hidden />
        </Link>
      ) : null}

      {/* Answer-first lead: the direct answer to an intent query, above the
          ranked list. Links to the nearest-open craving surface (or Open now). */}
      {answer && (
        <Link
          href={answer.href}
          aria-label={`${answer.label}: ${answer.kicker}`}
          className="tactile-interactive flex min-h-[64px] items-center gap-3 border-y px-1 py-3"
          style={{ borderColor: `color-mix(in srgb, ${answerColor} 34%, var(--app-border))` }}
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
        <section
          aria-label="Official county and city answers"
          className="overflow-hidden border-y"
          style={{ borderColor: "var(--app-border)" }}
        >
          {/* A direct resident task is more useful than a broad department
              match, so it leads when both exist (for example Food Control
              before the generic building-permits department). */}
          {civicAnswers.map((c, index) => (
            <a
              key={c.id}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="tactile-interactive flex min-h-[56px] items-center gap-3 px-3.5 py-2.5"
              style={index > 0
                ? { borderTop: "1px solid var(--app-border)" }
                : undefined}
            >
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)", color: "var(--app-cool)" }}>
                <Building2 className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{c.title}</span>
                <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>{c.subtitle}</span>
              </span>
              <ArrowRight aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} />
            </a>
          ))}
          {govAnswers.map((d, index) => (
            <div
              key={d.slug}
              className="p-3.5"
              style={civicAnswers.length > 0 || index > 0
                ? { borderTop: "1px solid var(--app-border)" }
                : undefined}
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
        </section>
      )}

      {!query && (
        <div className="space-y-3">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Start with
          </p>
          {/* Answer-style prompts — the same "Ask Radius" register as Today.
              Each one ROUTES to a real surface that actually answers it
              (a curated collection, a category, the weekend view, open-now
              on the map) rather than running a dead text query. Only intents
              with an honest destination are listed — no prompt that leads to
              an empty result. */}
          <ul
            className="grid grid-cols-2 overflow-hidden border-y"
            style={{ borderColor: "var(--app-border)" }}
          >
            {[
              { label: "Open right now", href: "/open-now" },
              { label: "Coffee nearby", href: "/nearby?c=coffee" },
              { label: "This weekend", href: "/events?lens=weekend" },
              { label: "Out with kids", href: "/collections/kid-energy-burners" },
              { label: "Walkable date night", href: "/collections/walkable-date-night" },
              { label: "Rainy-day ideas", href: "/collections/rainy-day-frederick" },
            ].map((p) => (
              <li key={p.label} className="border-b odd:border-r" style={{ borderColor: "var(--app-border)" }}>
                <Link
                  href={p.href}
                  className="tactile-interactive flex min-h-[52px] items-center gap-2 px-3 py-2 text-[13px] font-semibold"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  <span className="min-w-0 flex-1">{p.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {query && rankedHits.length === 0 && govAnswers.length === 0 && civicAnswers.length === 0 && (
        <div className="space-y-2 border-y px-2 py-8 text-center text-sm" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          <p>There are no matches for &ldquo;{query}&rdquo;. Try a shorter search or add a town.</p>
          <p>
            Need a government office?{" "}
            <Link href="/contacts" className="font-semibold underline underline-offset-2" style={{ color: "var(--app-ink-2)" }}>
              Every service and who to call
            </Link>
          </p>
        </div>
      )}

      {rankedHits.length > 0 && (
        <section className="space-y-2" aria-label={`${rankedHits.length} results for ${query}`}>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            {rankedHits.length} {rankedHits.length === 1 ? "match" : "matches"}
            {remainingHits.length > 0 ? " · best matches first" : ""}
          </p>
          <ul
            className="reveal-up overflow-hidden border-y"
            style={{ borderColor: "var(--app-border)" }}
          >
            {primaryHits.map((hit, index) => (
              <SearchResultRow
                key={keyFor(hit)}
                hit={hit}
                dominantType={dominantType}
                divided={index > 0}
                showBranchAddress={hit.type === "place" && duplicateBranches.has(branchKey(hit))}
                mapReturnTo={mapReturnHref ?? undefined}
              />
            ))}
          </ul>
          {remainingHits.length > 0 && (
            <details className="group border-b" style={{ borderColor: "var(--app-border)" }}>
              <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-brand-press)" }}>
                Show {remainingHits.length} more matches
                <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} />
              </summary>
              <ul aria-label={`More results for ${query}`}>
                {remainingHits.map((hit, index) => (
                  <SearchResultRow
                    key={keyFor(hit)}
                    hit={hit}
                    dominantType={dominantType}
                    divided={index > 0}
                    showBranchAddress={hit.type === "place" && duplicateBranches.has(branchKey(hit))}
                    mapReturnTo={mapReturnHref ?? undefined}
                  />
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
