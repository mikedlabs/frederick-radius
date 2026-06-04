import Image from "next/image";
import {
  Search,
  SlidersHorizontal,
  Star,
  MapPin,
  ChevronRight,
  ArrowUpRight,
  Map as MapIcon,
  Sparkles,
} from "lucide-react";
import { PLACES, AERIALS, HERO_AERIAL } from "./data";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * Discover — a premium, magazine-style "browse all of Frederick" screen.
 *
 * Composition (top → bottom), built for a 9:16 portrait canvas:
 *  1. A full-bleed cinematic aerial cover with the section title + search bar
 *     pinned to the bottom edge, so the photo owns the top third of the phone.
 *  2. A horizontal snap rail of category "lenses" — each chip wears its own
 *     category .color, the selected one swelling into a small photo tile.
 *  3. An editorial "Editor's pick" — a tall overlapping card that bleeds a
 *     second aerial behind it for layered depth.
 *  4. A staggered two-column "best places" gallery (NOT a flat list): the
 *     left and right columns are vertically offset so the eye zig-zags.
 *  5. A pinned bottom "open the map" peek bar.
 */

const DEPTH =
  "0 1px 2px rgba(26,24,21,0.05), 0 22px 48px -24px rgba(26,24,21,0.30)";

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const;

export default function DiscoverMock() {
  // The full curated set, used across every category.
  const places = PLACES;

  // Unique categories in source order — drives the lens rail.
  const categories = places.filter(
    (p, i) => places.findIndex((q) => q.category === p.category) === i,
  );

  // Editorial hero pick: the single highest-rated, most-reviewed place.
  const pick = [...places].sort(
    (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  )[0];

  // Everyone else flows into the staggered gallery.
  const rest = places.filter((p) => p.slug !== pick.slug);
  const left = rest.filter((_, i) => i % 2 === 0);
  const right = rest.filter((_, i) => i % 2 === 1);

  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[440px] overflow-hidden"
      style={{ background: "var(--app-bg)" }}
    >
      {/* ============================ COVER ============================ */}
      <header className="relative">
        <span className="relative block h-[58vh] max-h-[560px] min-h-[440px] w-full overflow-hidden">
          <Image
            src={HERO_AERIAL}
            alt="Aerial view of Frederick County, Maryland from above"
            fill
            priority
            sizes="440px"
            placeholder="blur"
            blurDataURL={PAPER_CREAM_BLUR}
            className="object-cover"
          />
          {/* legibility wash — darker at the foot, clear at the brow */}
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(20,17,13,0.42) 0%, rgba(20,17,13,0) 28%, rgba(20,17,13,0) 46%, rgba(20,17,13,0.72) 86%, rgba(20,17,13,0.92) 100%)",
            }}
          />
        </span>

        {/* top status / brand row */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5">
          <span
            className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--app-ink-inverse)" }}
          >
            <Sparkles className="h-4 w-4" style={{ color: "var(--app-accent)" }} />
            Frederick Radius
          </span>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md"
            style={{
              background: "rgba(244,239,230,0.16)",
              border: "1px solid rgba(244,239,230,0.28)",
            }}
          >
            <SlidersHorizontal
              className="h-4 w-4"
              style={{ color: "var(--app-ink-inverse)" }}
              aria-hidden
            />
          </span>
        </div>

        {/* title + search pinned to the bottom of the cover */}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-6">
          <p
            className="mb-1 text-[12px] font-semibold uppercase tracking-[0.26em]"
            style={{ color: "var(--app-accent)" }}
          >
            The field guide
          </p>
          <h1
            className="text-[44px] font-bold leading-[0.94] tracking-[-0.02em]"
            style={{ ...SERIF, color: "var(--app-ink-inverse)" }}
          >
            Discover
            <br />
            all of Frederick
          </h1>
          <p
            className="mt-2 max-w-[300px] text-[13.5px] leading-snug"
            style={{ color: "rgba(244,239,230,0.82)" }}
          >
            {places.length} hand-picked places across {categories.length}{" "}
            categories — the county&apos;s very best, from above.
          </p>

          {/* search bar */}
          <div
            className="mt-4 flex items-center gap-3 rounded-full px-4 py-3"
            style={{
              background: "rgba(247,240,224,0.94)",
              boxShadow: DEPTH,
              backdropFilter: "blur(6px)",
            }}
          >
            <Search
              className="h-[18px] w-[18px] shrink-0"
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
            <span className="text-[14px]" style={{ color: "var(--app-ink-3)" }}>
              Search coffee, trails, breweries…
            </span>
          </div>
        </div>
      </header>

      {/* ===================== CATEGORY LENS RAIL ===================== */}
      <section aria-label="Browse by category" className="pt-6">
        <div className="mb-3 flex items-baseline justify-between px-5">
          <h2
            className="text-[20px] font-bold tracking-[-0.01em]"
            style={{ ...SERIF, color: "var(--app-ink)" }}
          >
            Pick a lens
          </h2>
          <span
            className="flex items-center gap-0.5 text-[12px] font-semibold"
            style={{ color: "var(--app-brand)" }}
          >
            See all
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>

        <div
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {/* "All" pill leads the rail, selected */}
          <span
            className="flex shrink-0 snap-start items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold"
            style={{
              background: "var(--app-ink)",
              color: "var(--app-ink-inverse)",
              boxShadow: DEPTH,
            }}
          >
            <MapIcon className="h-4 w-4" aria-hidden />
            All {places.length}
          </span>

          {categories.map((c, i) => {
            // The first real lens swells into a photo tile to lead the eye.
            const featured = i === 0;
            return (
              <span
                key={c.category}
                className="relative flex shrink-0 snap-start items-center overflow-hidden rounded-full"
                style={{
                  background: "var(--app-bg-elevated-solid)",
                  border: "1px solid var(--app-border)",
                  boxShadow: DEPTH,
                }}
              >
                <span
                  className="relative block h-9 w-9 overflow-hidden rounded-full"
                  style={{
                    margin: 5,
                    boxShadow: featured
                      ? `0 0 0 2px ${c.color}`
                      : "inset 0 0 0 1px rgba(26,24,21,0.06)",
                  }}
                >
                  <Image
                    src={c.photo}
                    alt=""
                    aria-hidden
                    fill
                    sizes="36px"
                    placeholder="blur"
                    blurDataURL={PAPER_CREAM_BLUR}
                    className="object-cover"
                  />
                </span>
                <span
                  className="py-2.5 pr-4 pl-0.5 text-[13px] font-semibold"
                  style={{ color: "var(--app-ink)" }}
                >
                  {c.category}
                </span>
                <span
                  aria-hidden
                  className="mr-3.5 h-1.5 w-1.5 rounded-full"
                  style={{ background: c.color }}
                />
              </span>
            );
          })}
        </div>
      </section>

      {/* ======================= EDITOR'S PICK ======================= */}
      <section aria-label="Editor's pick" className="px-5 pt-8">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="h-px flex-1"
            style={{ background: "var(--app-border)" }}
            aria-hidden
          />
          <span
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "var(--app-brand)" }}
          >
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
            Editor&apos;s pick
          </span>
          <span
            className="h-px flex-1"
            style={{ background: "var(--app-border)" }}
            aria-hidden
          />
        </div>

        <article
          className="relative overflow-hidden rounded-[28px]"
          style={{ boxShadow: DEPTH }}
        >
          <span className="relative block h-[300px] w-full overflow-hidden">
            <Image
              src={pick.photo}
              alt={pick.name}
              fill
              sizes="440px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(20,17,13,0.88) 0%, rgba(20,17,13,0.32) 45%, rgba(20,17,13,0) 72%)",
              }}
            />
          </span>

          {/* category + rating chips floating top */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ background: pick.color, color: "#fff" }}
            >
              {pick.category}
            </span>
            <span
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold backdrop-blur-md"
              style={{
                background: "rgba(247,240,224,0.92)",
                color: "var(--app-ink)",
              }}
            >
              <Star
                className="h-3.5 w-3.5 fill-current"
                style={{ color: "var(--app-accent)" }}
                aria-hidden
              />
              {pick.rating.toFixed(1)}
            </span>
          </div>

          {/* copy block */}
          <div className="absolute inset-x-0 bottom-0 p-5">
            <h3
              className="text-[30px] font-bold leading-[0.98] tracking-[-0.01em]"
              style={{ ...SERIF, color: "var(--app-ink-inverse)" }}
            >
              {pick.name}
            </h3>
            <p
              className="mt-1.5 max-w-[290px] text-[13.5px] leading-snug"
              style={{ color: "rgba(244,239,230,0.85)" }}
            >
              {pick.blurb}
            </p>

            <div
              className="mt-3 flex items-center gap-3 text-[12.5px] font-medium"
              style={{ color: "rgba(244,239,230,0.92)" }}
            >
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {pick.neighborhood}
              </span>
              <span aria-hidden style={{ color: "rgba(244,239,230,0.5)" }}>
                ·
              </span>
              <span>{pick.distance}</span>
              <span aria-hidden style={{ color: "rgba(244,239,230,0.5)" }}>
                ·
              </span>
              <span>{pick.price}</span>
              <span
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: "var(--app-ink-inverse)" }}
              >
                <ArrowUpRight
                  className="h-[18px] w-[18px]"
                  style={{ color: "var(--app-ink)" }}
                  aria-hidden
                />
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* ===================== STAGGERED GALLERY ===================== */}
      <section aria-label="The best places" className="px-5 pt-9">
        <div className="mb-4 flex items-baseline justify-between">
          <h2
            className="text-[22px] font-bold tracking-[-0.01em]"
            style={{ ...SERIF, color: "var(--app-ink)" }}
          >
            The best of the county
          </h2>
          <span
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            {rest.length} more
          </span>
        </div>

        <div className="flex gap-3.5">
          {/* offset the right column down so the columns interlock */}
          <div className="flex w-1/2 flex-col gap-3.5">
            {left.map((p) => (
              <PlaceCard key={p.slug} place={p} />
            ))}
          </div>
          <div className="flex w-1/2 flex-col gap-3.5 pt-9">
            {right.map((p) => (
              <PlaceCard key={p.slug} place={p} />
            ))}
          </div>
        </div>
      </section>

      {/* ===================== AERIAL CODA STRIP ===================== */}
      <section aria-label="From above" className="px-5 pt-9">
        <div
          className="relative overflow-hidden rounded-[24px]"
          style={{ boxShadow: DEPTH }}
        >
          <span className="relative block h-[150px] w-full overflow-hidden">
            <Image
              src={AERIALS[3]}
              alt="Frederick County under a dusting of winter snow, seen from a drone"
              fill
              sizes="400px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(105deg, rgba(20,17,13,0.78) 0%, rgba(20,17,13,0.25) 55%, rgba(20,17,13,0) 100%)",
              }}
            />
          </span>
          <div className="absolute inset-y-0 left-0 flex max-w-[235px] flex-col justify-center p-5">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--app-accent)" }}
            >
              Map view
            </p>
            <h3
              className="mt-1 text-[21px] font-bold leading-[1.02]"
              style={{ ...SERIF, color: "var(--app-ink-inverse)" }}
            >
              See it all on the map
            </h3>
          </div>
        </div>
      </section>

      {/* spacer so content clears the floating peek bar */}
      <div aria-hidden className="h-28" />

      {/* ====================== MAP PEEK BAR ====================== */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[440px] justify-center px-5 pb-6">
        <div
          className="pointer-events-auto flex w-full items-center gap-3 rounded-full py-2.5 pr-2.5 pl-5"
          style={{
            background: "var(--app-ink)",
            boxShadow:
              "0 1px 2px rgba(26,24,21,0.05), 0 26px 50px -18px rgba(26,24,21,0.55)",
          }}
        >
          <MapIcon
            className="h-5 w-5 shrink-0"
            style={{ color: "var(--app-accent)" }}
            aria-hidden
          />
          <div className="min-w-0 flex-1 leading-tight">
            <p
              className="truncate text-[13.5px] font-bold"
              style={{ color: "var(--app-ink-inverse)" }}
            >
              Open the map
            </p>
            <p
              className="truncate text-[11.5px]"
              style={{ color: "rgba(244,239,230,0.6)" }}
            >
              {places.length} places · all of Frederick County
            </p>
          </div>
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--app-brand)" }}
          >
            <ArrowUpRight
              className="h-5 w-5"
              style={{ color: "#fff" }}
              aria-hidden
            />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A single staggered-gallery card. Photo matches the place's category */
/* via its own .photo + .color.                                        */
/* ------------------------------------------------------------------ */
function PlaceCard({
  place,
}: {
  place: (typeof PLACES)[number];
}) {
  return (
    <article
      className="overflow-hidden rounded-[20px]"
      style={{
        background: "var(--app-bg-elevated-solid)",
        border: "1px solid var(--app-border)",
        boxShadow: DEPTH,
      }}
    >
      <span className="relative block h-36 w-full overflow-hidden">
        <Image
          src={place.photo}
          alt={place.name}
          fill
          sizes="200px"
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
        />
        {/* category tag */}
        <span
          className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]"
          style={{ background: place.color, color: "#fff" }}
        >
          {place.category}
        </span>
        {/* open/closed dot */}
        <span
          className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur-md"
          style={{
            background: "rgba(247,240,224,0.92)",
            color: place.open ? "var(--app-positive)" : "var(--app-ink-3)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: place.open
                ? "var(--app-positive)"
                : "var(--app-ink-3)",
            }}
            aria-hidden
          />
          {place.open ? "Open" : "Closed"}
        </span>
      </span>

      <div className="p-3">
        <div className="flex items-center gap-1">
          <Star
            className="h-3.5 w-3.5 fill-current"
            style={{ color: "var(--app-accent)" }}
            aria-hidden
          />
          <span
            className="text-[12.5px] font-bold"
            style={{ color: "var(--app-ink)" }}
          >
            {place.rating.toFixed(1)}
          </span>
          <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            ({place.reviews.toLocaleString()})
          </span>
          <span
            className="ml-auto text-[11px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            {place.price}
          </span>
        </div>

        <h3
          className="mt-1 text-[16px] font-bold leading-tight tracking-[-0.01em]"
          style={{ ...SERIF, color: "var(--app-ink)" }}
        >
          {place.name}
        </h3>

        <p
          className="mt-1.5 flex items-center gap-1 text-[11.5px] font-medium"
          style={{ color: "var(--app-ink-2)" }}
        >
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{place.neighborhood}</span>
          <span aria-hidden style={{ color: "var(--app-ink-3)" }}>
            ·
          </span>
          <span className="shrink-0">{place.distance}</span>
        </p>
      </div>
    </article>
  );
}
