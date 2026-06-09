import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Coffee,
  UtensilsCrossed,
  Baby,
  Toilet,
  ParkingCircle,
  Phone,
  Search,
  Clock,
  Trees,
  Building2,
} from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import IconStamp from "@/components/ui/IconStamp";
import CategoryIcon from "@/components/place/CategoryIcon";
import PlaceCard from "@/components/place/PlaceCard";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG, TOP_CATEGORIES } from "@/data/categories";
import MunicipalityStrip from "@/components/today/MunicipalityStrip";
import { INTENT_BY_KEY } from "@/data/intents";

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
  description:
    "Every place in Frederick County, by category, by town, or on the map. Restaurants, parks, breweries, shops, civic services — the directory.",
  openGraph: { title: "All places", description:
    "Every place in Frederick County, by category, by town, or on the map. Restaurants, parks, breweries, shops, civic services — the directory." },
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
    <div className="relative space-y-7">
      <PageBloom variant="warm-cool" />

      {/* HERO — a calm question, not a directory count. The old lead put
          "1,600 places across 13 towns" as the emotional message; that's
          demoted to a quiet placeholder in the search affordance below. */}
      <header className="space-y-4">
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          What kind of place <br />do you need?
        </h1>
        {/* Search affordance — the obvious first action. Opens the typed
            search; the count rides along as a quiet supporting detail. */}
        <Link
          href="/search"
          aria-label="Search places"
          className="tactile tactile-interactive group flex items-center gap-3 rounded-full py-3.5 pl-4 pr-2.5"
          style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)" }}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)", color: "var(--app-brand)" }}
          >
            <Search className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: "var(--app-ink-3)" }}>
            Search {total.toLocaleString()} places…
          </span>
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform group-active:scale-95"
            style={{ background: "var(--app-brand)", color: "var(--app-on-brand, #fff)" }}
            aria-hidden
          >
            <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </span>
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
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Start with a need
        </h2>
        <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {[
            { label: "Open now", href: "/open-now", icon: Clock, color: "var(--app-positive)" },
            { label: "Eat & drink", href: "/map?intent=eat", icon: UtensilsCrossed, color: INTENT_BY_KEY.eat?.color ?? "var(--app-brand)" },
            { label: "Coffee", href: "/map?intent=coffee", icon: Coffee, color: INTENT_BY_KEY.coffee?.color ?? "var(--app-brand)" },
            { label: "With kids", href: "/map?intent=family", icon: Baby, color: INTENT_BY_KEY.family?.color ?? "var(--app-brand)" },
            { label: "Outdoors", href: "/map?intent=outdoor", icon: Trees, color: INTENT_BY_KEY.outdoor?.color ?? "var(--app-brand-2)" },
            { label: "Parking", href: "/category/parking", icon: ParkingCircle, color: "var(--app-ink-2)" },
            { label: "Restrooms", href: "/amenities", icon: Toilet, color: "var(--app-cool)" },
            { label: "Explore by town", href: "/towns", icon: Building2, color: "var(--app-brand)" },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.label}>
                <Link
                  href={m.href}
                  className="tactile tactile-interactive flex min-h-[104px] flex-col items-start justify-between gap-3 rounded-[var(--app-radius-lg)] p-4"
                  style={{
                    background: `linear-gradient(155deg, color-mix(in srgb, ${m.color} 10%, var(--app-bg-elevated-solid)) 0%, var(--app-bg-elevated-solid) 60%)`,
                    boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)",
                  }}
                >
                  <IconStamp accent={m.color} size="lg">
                    <Icon aria-hidden />
                  </IconStamp>
                  <span className="text-[15px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {m.label}
                  </span>
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
        <section aria-label="Local favorites" className="space-y-3">
          <header className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-[18px] w-[3px] rounded-full" style={{ background: "var(--app-brand)" }} />
              <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                Local favorites
              </h2>
            </div>
          </header>
          <ul className="space-y-2.5">
            {favorites.map((p, i) => (
              <li key={p.slug}>
                {i === 0 ? (
                  <div
                    className="rounded-[var(--app-radius-lg)]"
                    style={{ boxShadow: "0 16px 36px -20px color-mix(in srgb, var(--app-brand) 55%, transparent)" }}
                  >
                    <PlaceCard place={p} variant="row" />
                  </div>
                ) : (
                  <PlaceCard place={p} variant="row" />
                )}
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
      <Link
        href="/contacts"
        className="hover-lift relative flex items-center gap-3 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-4 py-3.5 transition"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 110% at 0% 0%, color-mix(in srgb, var(--app-cool) 12%, transparent), transparent 60%)",
          }}
        />
        <span
          aria-hidden
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{
            background:
              "color-mix(in srgb, var(--app-cool) 14%, transparent)",
          }}
        >
          <Phone
            className="h-4 w-4"
            strokeWidth={2}
            style={{ color: "var(--app-cool)" }}
            aria-hidden
          />
        </span>
        <span className="relative min-w-0 flex-1">
          <span
            className="block text-[13.5px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            Who to call
          </span>
          <span
            className="block text-[11.5px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            City and county departments plus emergency lines.
          </span>
        </span>
        <ArrowRight
          className="relative h-4 w-4 shrink-0"
          strokeWidth={2.25}
          style={{ color: "var(--app-ink-3)" }}
          aria-hidden
        />
      </Link>

      {/* Categories — the primary browsing axis for someone who knows
          what kind of place they want but not which town. Sorted by
          count (highest first) so the dense parts of the directory
          read up top. */}
      <section className="space-y-3">
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          By category
        </h2>
        <ul
          className="reveal-up grid grid-cols-2 gap-2 sm:grid-cols-3"
          aria-label="Browse places by category"
        >
          {catCounts.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/category/${c.slug}`}
                className="hover-lift flex items-start gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition"
                style={{
                  borderColor: "var(--app-border)",
                }}
              >
                <IconStamp accent={c.color} size="md">
                  <CategoryIcon
                    slug={c.slug}
                    strokeWidth={1.75}
                    className="h-[18px] w-[18px]"
                  />
                </IconStamp>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {c.name}
                  </span>
                  <span
                    className="block text-[11px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {c.n.toLocaleString()}{" "}
                    {c.n === 1 ? "place" : "places"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Towns — the primary browsing axis for someone who knows
          where they want to go but not what to do there. Same
          highest-first sort; towns with zero seeded places are
          hidden so we never advertise empty surfaces. */}
      <section className="space-y-3">
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          By town
        </h2>
        {/* Alive town cards — name + this-week event count + the town's
            next move (its soonest event), or its editorial blurb when
            quiet. Richer than the old count-only list, and shared with
            the rest of the app (audit E2). */}
        <MunicipalityStrip />
      </section>

      {/* Search nudge — the third browsing path. Keyboard ⌘K opens
          the full-text search; we point at the TopBar so the user
          doesn't have to learn the shortcut. */}
      <section
        className="rounded-[var(--app-radius-lg)] border p-5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <h2
          className="font-serif text-[18px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Looking for somewhere specific?
        </h2>
        <p
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Tap the search bar at the top — or hit{" "}
          <kbd
            className="rounded border px-1.5 py-0.5 font-mono text-[11px]"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-sunken)",
              color: "var(--app-ink-2)",
            }}
          >
            ⌘K
          </kbd>
          . Search runs across every place, event, and town.
        </p>
      </section>
    </div>
  );
}
