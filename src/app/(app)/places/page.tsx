import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, MapPin } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import IconStamp from "@/components/ui/IconStamp";
import CategoryIcon from "@/components/place/CategoryIcon";
import { publicPlaces } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG, TOP_CATEGORIES } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";

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
  title: "All places",
  description:
    "Every place in Frederick County, by category, by town, or on the map. Restaurants, parks, breweries, shops, civic services — the directory.",
};

export default function PlacesIndexPage() {
  const all = publicPlaces();
  const total = all.length;

  // Per-category counts roll children up into their top-level parent.
  // (A "restaurant" record counts under "Food & Drink"; a "trail" under
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

  // Per-town counts. Same honest-empty rule — towns with zero seeded
  // places don't show up as a dangling tile.
  const townCounts = MUNICIPALITIES.map((m) => ({
    ...m,
    n: all.filter((p) => p.municipality === m.slug).length,
  }))
    .filter((m) => m.n > 0)
    .sort((a, b) => b.n - a.n);

  return (
    <div className="relative space-y-7">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          The directory
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Every place in Frederick County.
        </h1>
        <p
          className="text-[15px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          {total.toLocaleString()} places across {townCounts.length} towns.
          Browse by category, by town, or open the map.
        </p>
      </header>

      {/* Quick-access strip — the two top-level alternates to a
          browse-the-list view. Map for the spatial answer, Radius
          for the "what's near me right now" answer. */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/browse"
          className="hover-lift flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-4 py-3 transition"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
            }}
            aria-hidden
          >
            <Compass
              className="h-4 w-4"
              strokeWidth={2}
              style={{ color: "var(--app-cool)" }}
            />
          </span>
          <span className="min-w-0">
            <span
              className="block text-[13px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              View on map
            </span>
            <span
              className="block text-[11px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Spatial answer
            </span>
          </span>
        </Link>
        <Link
          href="/radius"
          className="hover-lift flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-4 py-3 transition"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
            }}
            aria-hidden
          >
            <MapPin
              className="h-4 w-4"
              strokeWidth={2}
              style={{ color: "var(--app-brand)" }}
            />
          </span>
          <span className="min-w-0">
            <span
              className="block text-[13px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              Within reach
            </span>
            <span
              className="block text-[11px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Walk, bike, drive radius
            </span>
          </span>
        </Link>
      </div>

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
        <ul
          className="reveal-up grid grid-cols-2 gap-2 sm:grid-cols-3"
          aria-label="Browse places by town"
        >
          {townCounts.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/m/${m.slug}`}
                className="hover-lift flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {m.name}
                  </span>
                  <span
                    className="block text-[11px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {m.n.toLocaleString()}{" "}
                    {m.n === 1 ? "place" : "places"}
                  </span>
                </span>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0"
                  strokeWidth={2.25}
                  style={{ color: "var(--app-ink-3)" }}
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
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
