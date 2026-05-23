import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { rankPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { FREDERICK_CENTER } from "@/lib/geo";
import PageBloom from "@/components/ui/PageBloom";

/**
 * /discover — "Hidden Frederick", the editorial counter to the
 * Today page's popular picks.
 *
 * Today surfaces the proven destinations (FeaturedTonight, RightNow):
 * highly-rated, photogenic, well-known. This page is the opposite —
 * places that pass the editorial quality bar (verified, photographed,
 * in a destination category) but DON'T usually crack the top-50 ranked
 * list. The "you live here, you didn't know" tier.
 *
 * Pure server component. Deterministic daily rotation so a return
 * visitor sees a different sweep each morning; same visitor sees the
 * same picks all day.
 */

export const metadata: Metadata = {
  title: "Hidden Frederick",
  description:
    "Twelve places worth finding that don't usually make the top of the list. Rotates daily.",
};

// Cache aggressively — the picks only change once per UTC day.
export const revalidate = 3600;

// Categories that read as "destinations" — places someone would
// deliberately seek out, not service businesses or stops-of-utility.
// Tighter than EVENING_CATEGORIES on Today: we want gem-shaped
// places, not pizza-place-shaped places.
const GEM_CATEGORIES: ReadonlySet<string> = new Set([
  "gallery",
  "museum",
  "public-art",
  "theater",
  "market",
  "bakery",
  "brewery",
  "winery",
  "distillery",
  "coffee",
  "park",
  "trail",
  "outdoors",
  "music",
  "lodging",
  "shop",
  "bookstore",
]);

// Skip the top-N most-prominent places — those already get top
// billing on Today / Radius / municipality pages. The whole point of
// /discover is "you've already seen the famous ones; here's more."
const SKIP_TOP_N = 30;

// How many gems to render. Twelve is the sweet spot: enough to feel
// abundant (a real wall of options), small enough to read as curated
// rather than a directory dump.
const GEM_COUNT = 12;

function pickGems(dayIdx: number): PlaceCardData[] {
  const ranked = rankPlaces({
    origin: FREDERICK_CENTER,
    preferOpen: false,
    limit: 500,
  });
  const eligible = ranked
    .slice(SKIP_TOP_N)
    .filter((p) => Boolean(p.google_photo_url))
    .filter((p) => p.is_verified)
    .filter((p) => GEM_CATEGORIES.has(p.category));

  if (eligible.length === 0) return [];

  // Rotate the starting offset by day so the wall is different
  // across daily visits but stable within a day. Step by a coprime
  // number against the pool size so successive picks aren't adjacent
  // in the ranked list (better diversity).
  const start =
    ((dayIdx % eligible.length) + eligible.length) % eligible.length;
  return Array.from(
    { length: Math.min(GEM_COUNT, eligible.length) },
    (_, i) => eligible[(start + i * 17) % eligible.length],
  );
}

export default function DiscoverPage() {
  // Server component — `Date.now()` is request-scoped; that's the
  // feature (daily rotation per request).
  // eslint-disable-next-line react-hooks/purity
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const gems = pickGems(dayIdx);

  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

      <header className="space-y-2">
        <p
          className="eyebrow inline-flex items-center gap-1.5"
          style={{ color: "var(--app-ink-3)" }}
        >
          <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          Discover
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Hidden Frederick.
        </h1>
        <p
          className="text-[14px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          Twelve places worth finding that don&apos;t always make the top of the
          list. A gallery tucked behind a bookstore, a bakery off the highway,
          a brewery on a side road. Rotates daily, so come back tomorrow.
        </p>
      </header>

      {gems.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-md)] border p-4 text-[13px]"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink-3)",
            background: "var(--app-bg-elevated)",
          }}
        >
          No hidden gems queued today. Check back tomorrow.
        </p>
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          aria-label={`${gems.length} hidden gems for today`}
        >
          {gems.map((p) => {
            const cat = CATEGORY_BY_SLUG[p.category];
            const accent = cat?.color ?? "var(--app-brand)";
            return (
              <li key={p.slug}>
                <Link
                  href={`/places/${p.slug}`}
                  aria-label={`${p.name} — ${cat?.name ?? p.category}`}
                  className="tactile tactile-interactive group relative block aspect-[4/5] overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.google_photo_url}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  {/* Legibility gradient — bottom-weighted for the
                      title sitting over the photo. */}
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent"
                  />
                  {/* Category-color hairline at the top — keeps the
                      taxonomy readable without a chip stealing focus. */}
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-[3px]"
                    style={{ background: accent }}
                  />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p
                      className="text-[10px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: accent, textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
                    >
                      {cat?.name ?? p.category}
                    </p>
                    <p
                      className="mt-0.5 font-serif text-[16px] font-semibold leading-tight text-white"
                      style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
                    >
                      {p.name}
                    </p>
                    <p
                      className="mt-0.5 text-[11px] text-white/80"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                    >
                      {MUNICIPALITY_BY_SLUG[p.municipality ?? ""]?.name ?? p.municipality ?? "Frederick County"}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p
        className="text-center text-[11px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Sweep refreshes daily. Tap any place for hours, photos, directions.
      </p>
    </div>
  );
}
