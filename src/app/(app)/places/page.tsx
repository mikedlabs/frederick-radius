import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Coffee,
  UtensilsCrossed,
  Baby,
  MapPin,
  ParkingCircle,
  Phone,
  Search,
  Clock,
  Trees,
  Building2,
} from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import CategoryIcon from "@/components/place/CategoryIcon";
import PlaceCard from "@/components/place/PlaceCard";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG, TOP_CATEGORIES } from "@/data/categories";
import MunicipalityStrip from "@/components/today/MunicipalityStrip";
import CollapsibleSection from "@/components/ui/CollapsibleSection";

/**
 * /places — the directory index.
 *
 * Existed-only-as-a-dynamic-route until now: `/places/[slug]` rendered
 * an individual place, but landing on /places itself 404'd. The result
 * was that a stranger had no top-down view of the 1,700+ places we
 * keep. They had to either know what to search for, know which town
 * they wanted, know which category, or pan the map by hand. This is
 * the "table of contents" page — a stranger can land here and see the
 * breadth of the directory by category, by town, and by reach.
 *
 * Sits inside the (app) route group so it carries the same chrome as
 * the rest of the app. Pure server component; counts are derived from
 * publicPlaces() at request time and cached for 10 minutes so adding
 * a new seed place shows up without a full deploy.
 */

export const revalidate = 600;

export const metadata: Metadata = {
  alternates: { canonical: "/places" },
  title: "All places",
  description: "Browse Frederick County places by need, category, town, or map.",
  openGraph: { title: "All places", description:
    "Browse Frederick County places by need, category, town, or map." },
};

export default function PlacesIndexPage() {
  const all = publicPlaces();
  const total = all.length;

  // Per-category counts roll children up into their top-level parent.
  // (A "restaurant" record counts under "Eat & drink"; a "trail" under
  // "Parks & Trails".) Filter out empty tiles so the page never advertises
  // a category we don't actually have content for.
  const catCounts = TOP_CATEGORIES.map((c) => ({
    ...c,
    n: all.filter((p) => {
      const cat = CATEGORY_BY_SLUG[p.category];
      return p.category === c.slug || cat?.parent === c.slug;
    }).length,
  }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);

  // Local favorites preview — real, curated place cards so the page leads
  // with ANSWERS, not just a wall of category tiles. Decorate to PlaceCardData
  // (ratings, photo, local_favorite), keep curation-flagged or strongly-rated
  // photo-backed picks, most-reviewed first. Honest: if fewer than three
  // qualify the section self-hides.
  const favorites = all
    .map((p) => decoratePlace(p))
    .filter(
      (p) =>
        p.local_favorite ||
        ((p.google_rating ?? 0) >= 4.6 && (p.google_rating_count ?? 0) >= 120),
    )
    .filter((p) => Boolean(p.google_photo_url))
    .sort((a, b) => (b.google_rating_count ?? 0) - (a.google_rating_count ?? 0))
    .slice(0, 4);

  return (
    // PLAIN TOOL: the directory is rows on the white ground. No wash behind
    // the page, no tiles, cards or glows; sections are separated by space
    // and their rows by one hairline.
    <div className="relative space-y-8">

      {/* HERO — a calm question, not a directory count. The old lead put
          "1,600 places across 13 towns" as the emotional message; that's
          demoted to a quiet placeholder in the search affordance below. */}
      <header className="space-y-4">
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          What kind of place <br />do you need?
        </h1>
        {/* Search affordance — the obvious first action. Opens the typed
            search; the count rides along as a quiet supporting detail. */}
        {/* A field-shaped link: 6px corners and the control border, so it
            reads as the search box it opens. */}
        <Link
          href="/search"
          aria-label="Search places"
          className="flex min-h-12 items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5"
          style={{ borderColor: "var(--app-control-border)", background: "var(--app-bg)" }}
        >
          <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-2)" }} />
          <span className="min-w-0 flex-1 truncate text-[16px]" style={{ color: "var(--app-ink-2)" }}>
            Search {total.toLocaleString()} places…
          </span>
          <ArrowRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-2)" }} />
        </Link>
      </header>

      {/* Start with what you need — the human-intent rail. Pre-launch
          review §6 flagged that the page lead with "Every place in
          Frederick County" reads as a directory. This row gives a
          stranger six everyday questions ("where's a restroom," "where
          can I park," "I want coffee") with one-tap deep links into the
          right surface — /browse for moods, /radius for near-me,
          /category/parking and /amenities for the practical kinds.
          Visual language matches MoodTiles on /now: paper-cream tile,
          tinted icon stamp, two-line label. 2-col on mobile, 3-col from
          sm: so the row never dominates the page. */}
      {/* PRIMARY LANES — eight large, thumb-friendly starting points for
          everyday needs. Replaces the small equal-weight rows with no
          truncated sub-labels. The full category + town directory is kept,
          lower on the page. */}
      <section className="space-y-2">
        <SectionHeading title="Start with a need" />
        {/* Ruled link rows in two columns (one on a 320px phone). The glyph
            is a quiet ink mark; the label carries the choice. The heading's
            own hairline opens the list, so the list adds no top rule. */}
        <ul className="grid grid-cols-2 gap-x-6 max-[359px]:grid-cols-1 md:grid-cols-4">
          {[
            { label: "Open now", href: "/open-now", icon: Clock },
            { label: "Eat & drink", href: "/map?intent=eat", icon: UtensilsCrossed },
            { label: "Coffee", href: "/map?intent=coffee", icon: Coffee },
            { label: "With kids", href: "/map?intent=family", icon: Baby },
            { label: "Outdoors", href: "/map?intent=outdoor", icon: Trees },
            { label: "Parking", href: "/category/parking", icon: ParkingCircle },
            { label: "Nearby essentials", href: "/amenities", icon: MapPin },
            { label: "Browse by town", href: "/towns", icon: Building2 },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.label} className="min-w-0 border-b" style={{ borderColor: "var(--app-border)" }}>
                <Link
                  href={m.href}
                  className="flex min-h-12 items-center gap-2.5 rounded-[var(--app-radius-sm)] py-2 text-[15px] font-semibold leading-tight hover:underline"
                  style={{ color: "var(--app-ink)" }}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-2)" }} />
                  <span className="min-w-0">{m.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* LOCAL FAVORITES — a few real, curated place cards so the page
          leads with ANSWERS, not only navigation tiles. The lead card gets
          a soft brand glow (selected). Self-hides if fewer than three. */}
      {favorites.length >= 3 && (
        <section aria-label="Local favorites" className="space-y-2">
          <SectionHeading title="Local favorites" />
          {/* Ruled place rows; the first is not singled out with a glow. The
              heading's own hairline opens the list, so it adds no top rule. */}
          <ul>
            {favorites.map((p) => (
              <li key={p.slug}>
                <PlaceCard place={p} variant="row" />
              </li>
            ))}
          </ul>
        </section>
      )}


      {/* Government contacts entry — the "who do I call about a
          pothole / a stray dog / a permit" surface. Sits alongside
          Editorial collections so the page's two non-directory rows
          (taste + utility) read as a pair before the by-category and
          by-town breakdowns. */}
      {/* One ruled row; the Creek glyph keeps its civic meaning. It closes
          with its own bottom hairline only: the favorites list above already
          ends in one, so a top rule here would double it. The glyph sits in
          the same 88px slot as the place rows' glyphs, so this row's text
          lines up with theirs. */}
      <Link
        href="/contacts"
        className="flex min-h-12 items-center gap-3 border-b py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <span aria-hidden className="flex w-[88px] shrink-0 justify-center">
          <Phone
            className="h-6 w-6"
            strokeWidth={1.75}
            style={{ color: "var(--app-cool-text)" }}
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block text-[17px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            Who to call
          </span>
          <span
            className="block text-[14px]"
            style={{ color: "var(--app-ink-2)" }}
          >
            City and county departments plus emergency lines.
          </span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0"
          strokeWidth={2}
          style={{ color: "var(--app-ink-2)" }}
          aria-hidden
        />
      </Link>

      {/* Categories — the primary browsing axis for someone who knows
          what kind of place they want but not which town. Sorted by
          count (highest first) so the dense parts of the directory
          read up top. */}
      <CollapsibleSection
        title="Browse every category"
        count={catCounts.length}
        countLabel="categories"
        headingLevel={2}
        storageKey="fr.places.categories"
        className="space-y-3"
      >
        {/* Ruled rows, two columns (one on a 320px phone). No entrance
            animation: the list arrives with the navigation. The category
            glyph is a small ink mark, never a filled tile. */}
        <ul
          className="grid grid-cols-2 gap-x-6 border-t max-[359px]:grid-cols-1 sm:grid-cols-3"
          style={{ borderColor: "var(--app-border)" }}
          aria-label="Browse places by category"
        >
          {catCounts.map((c) => (
            <li key={c.slug} className="min-w-0 border-b" style={{ borderColor: "var(--app-border)" }}>
              <Link
                href={`/category/${c.slug}`}
                className="flex min-h-12 items-start gap-2.5 rounded-[var(--app-radius-sm)] py-2.5"
              >
                <CategoryIcon
                  slug={c.slug}
                  strokeWidth={1.75}
                  className="mt-0.5 h-[18px] w-[18px] shrink-0"
                  style={{ color: "var(--app-ink-2)" }}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[15px] font-semibold leading-snug"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {c.name}
                  </span>
                  <span
                    className="block text-[13px] tabular-nums"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {c.n.toLocaleString()}{" "}
                    {c.n === 1 ? "place" : "places"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      {/* Towns — the primary browsing axis for someone who knows
          where they want to go but not what to do there. Same
          highest-first sort; towns with zero seeded places are
          hidden so we never advertise empty surfaces. */}
      <CollapsibleSection
        title="Browse by town"
        headingLevel={2}
        storageKey="fr.places.towns"
        className="space-y-3"
      >
        {/* Alive town cards — name + this-week event count + the town's
            next move (its soonest event), or its editorial blurb when
            quiet. Richer than the old count-only list, and shared with
            the rest of the app (audit E2). */}
        <MunicipalityStrip />
      </CollapsibleSection>
    </div>
  );
}
