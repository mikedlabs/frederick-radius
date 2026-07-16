import Link from "next/link";
import { Wine, Baby, CloudRain, Sparkles, ArrowRight, CalendarCheck, Footprints, type LucideIcon } from "lucide-react";
import { COLLECTION_BY_SLUG } from "@/data/collections";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * CuratedPicks — the "want a plan, not just a thing" rail on /today.
 *
 * The craving grid above answers "I want ___ right now" (one tap into the
 * nearest open coffee/pizza/etc.). This is its editorial counterpart: the
 * hand-picked collections a resident would actually name — a walkable date
 * night, somewhere to burn kid energy, a rainy-day plan, the hidden gems.
 *
 * These collections already exist at /collections/<slug>; a beta review found
 * personas (date-night, families) landing on Today, seeing only broad category
 * icons, and "digging through categories" for exactly these. This surfaces them
 * at the front door. Pure discoverability — no new content, no client JS.
 *
 * Server component: it reads the static COLLECTION index and renders links.
 * Any pick whose collection is missing/empty is silently skipped, so the rail
 * can never render a dead card.
 */

// The picks to promote, each with a glyph that reads at a glance. Kept to a
// short set — the full catalogue is one tap away via "All collections."
const PICKS: { slug: string; Icon: LucideIcon }[] = [
  { slug: "walkable-date-night", Icon: Wine },
  { slug: "kid-energy-burners", Icon: Baby },
  { slug: "rainy-day-frederick", Icon: CloudRain },
  { slug: "hidden-gems", Icon: Sparkles },
];
const CLEAR_DAY_SWAP: { slug: string; Icon: LucideIcon } = {
  slug: "frederick-without-a-plan",
  Icon: Footprints,
};

/**
 * Weather-aware ordering (July 2026 outside review: "funny there's a
 * collection on the front page for Rainy Days yet the forecast is clear").
 * Rain coming in the next 12 hours leads with the rainy-day plan; a clear
 * forecast swaps it out for the unscripted-afternoon walk; an unavailable
 * forecast (null) keeps the evergreen order rather than guessing. Pure and
 * exported so the rule lives under unit tests.
 */
export function orderPicks(rainAhead: boolean | null): { slug: string; Icon: LucideIcon }[] {
  if (rainAhead === true) {
    const rainy = PICKS.find((p) => p.slug === "rainy-day-frederick")!;
    return [rainy, ...PICKS.filter((p) => p.slug !== "rainy-day-frederick")];
  }
  if (rainAhead === false) {
    return PICKS.map((p) => (p.slug === "rainy-day-frederick" ? CLEAR_DAY_SWAP : p));
  }
  return PICKS;
}

export default async function CuratedPicks() {
  // Same cached NWS call every weather surface makes — no extra fetch cost.
  const fc = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const next12 = fc?.hourly?.slice(0, 12) ?? [];
  const rainAhead: boolean | null =
    next12.length > 0
      ? next12.some((h) => (h.probabilityOfPrecipitation ?? 0) >= 40)
      : null;

  const picks = orderPicks(rainAhead)
    .map((p) => ({ ...p, c: COLLECTION_BY_SLUG[p.slug] }))
    .filter((p) => p.c && p.c.places.length > 0);
  if (picks.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="curated-picks-heading">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <h2
          id="curated-picks-heading"
          className="font-serif text-[17px] font-semibold leading-snug tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Plan the moment
        </h2>
        <Link
          href="/collections"
          className="tap-44 inline-flex items-center gap-1 text-[13px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          All collections
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Link>
      </div>

      {/* Horizontal scroller on phones (each card ~72% viewport so the next
          peeks), settling into a tidy grid at sm+. Scrollbar hidden; snap so
          swipes land on a card. */}
      <ul
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {picks.map(({ slug, Icon, c }) => (
          <li key={slug} className="min-w-[72%] shrink-0 snap-start sm:min-w-0">
            <Link
              href={`/collections/${slug}`}
              className="tactile tactile-interactive group relative flex h-full items-start gap-3 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3.5 transition"
              style={{
                borderColor: "var(--app-border)",
                boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
              }}
            >
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: c!.accent }}
              />
              <span
                aria-hidden
                className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ background: `color-mix(in srgb, ${c!.accent} 14%, transparent)` }}
              >
                <Icon className="h-4 w-4" strokeWidth={2} style={{ color: c!.accent }} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h3
                  className="font-serif text-[15px] font-semibold leading-snug tracking-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {c!.title}
                </h3>
                <p
                  className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {c!.places.length} {c!.places.length === 1 ? "place" : "places"}
                </p>
              </div>
              <ArrowRight
                className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.25}
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
            </Link>
          </li>
        ))}
        {/* The generator door — the answer to "these lists never change."
            /plan builds a fresh route from mood, group, and hours. */}
        <li className="min-w-[72%] shrink-0 snap-start sm:min-w-0">
          <Link
            href="/plan"
            className="tactile tactile-interactive group relative flex h-full items-start gap-3 overflow-hidden rounded-[var(--app-radius-lg)] border border-dashed bg-[var(--app-bg-sunken)] p-3.5 transition"
            style={{ borderColor: "var(--app-border-strong, var(--app-border))" }}
          >
            <span
              aria-hidden
              className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--app-brand-2) 14%, transparent)" }}
            >
              <CalendarCheck className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3
                className="font-serif text-[15px] font-semibold leading-snug tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Build your own
              </h3>
              <p
                className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Mood, group, hours
              </p>
            </div>
            <ArrowRight
              className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.25}
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
          </Link>
        </li>
      </ul>
    </section>
  );
}
