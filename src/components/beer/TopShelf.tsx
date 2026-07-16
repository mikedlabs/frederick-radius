import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { BREWERIES } from "@/data/beers";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * The top shelf — the county's highest-rated pours, straight from the
 * Untappd ratings the guide already carries (146 of 174 beers are rated),
 * rendered as an always-visible ledger instead of data buried behind the
 * explorer's sort menu. Max two per brewery so one hype house can't claim
 * the whole shelf; the full rated list lives in the explorer below.
 * Server-rendered: pure data, zero client cost.
 */

const SHELF_SIZE = 10;
const PER_BREWERY_CAP = 2;

type ShelfRow = {
  name: string;
  style: string;
  abv: number | null;
  rating: number;
  untappd: string | null;
  brewerySlug: string;
  breweryName: string;
  /** The brewery's real venue photo (the guide's Google pipeline). We hold
   *  no beer-label or logo assets, so the place photo is the honest visual. */
  photo: string | null;
};

function buildShelf(photoBySlug: Map<string, string | null>): ShelfRow[] {
  const all: ShelfRow[] = BREWERIES.flatMap((b) =>
    b.beers
      .filter((x) => x.rating != null)
      .map((x) => ({
        name: x.name,
        style: x.style,
        abv: x.abv,
        rating: x.rating as number,
        untappd: x.untappd ?? b.untappd,
        brewerySlug: b.slug,
        breweryName: b.name,
        photo: photoBySlug.get(b.slug) ?? null,
      })),
  ).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));

  const perBrewery = new Map<string, number>();
  const shelf: ShelfRow[] = [];
  for (const row of all) {
    const n = perBrewery.get(row.brewerySlug) ?? 0;
    if (n >= PER_BREWERY_CAP) continue;
    perBrewery.set(row.brewerySlug, n + 1);
    shelf.push(row);
    if (shelf.length === SHELF_SIZE) break;
  }
  return shelf;
}

export default function TopShelf({ breweryCards }: { breweryCards: PlaceCardData[] }) {
  const shelf = buildShelf(
    new Map(breweryCards.map((c) => [c.slug, c.google_photo_url ?? null])),
  );
  if (shelf.length === 0) return null;

  return (
    <section aria-labelledby="top-shelf-heading">
      <header className="mb-3">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Rated by the people who drank them
        </p>
        <h2
          id="top-shelf-heading"
          className="mt-0.5 font-serif text-[26px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The top shelf
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The county&rsquo;s highest-rated pours on Untappd, two per brewery at
          most. The full rated list is in the explorer below.
        </p>
      </header>

      <ol
        className="overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        {shelf.map((row, i) => (
          <li
            key={`${row.brewerySlug}:${row.name}`}
            className="relative"
            style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
          >
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span
                aria-hidden
                className="w-6 shrink-0 text-center font-mono text-[12px] font-bold tabular-nums"
                style={{ color: i < 3 ? "var(--app-brand-press)" : "var(--app-ink-3)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              {row.photo && (
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px]">
                  {/* Proxy photos are already sized + cached; /_next/image
                      re-optimizing them breaks (PlacePhoto convention). */}
                  <Image src={row.photo} alt="" fill sizes="44px" className="object-cover" unoptimized={row.photo.startsWith("/api/place-photo")} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                  {row.name}
                </p>
                <p className="truncate text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                  {row.style}
                  {row.abv != null ? ` · ${row.abv.toFixed(1)}%` : ""}
                </p>
                {/* The brewery gets its own line — truncating the PLACE out
                    of a places guide defeats the row (390px check). */}
                <Link
                  href={`/places/${row.brewerySlug}`}
                  className="relative z-10 block truncate text-[11.5px] font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {row.breweryName}
                </Link>
              </div>
              <span
                className="shrink-0 font-mono text-[13px] font-bold tabular-nums"
                style={{ color: "var(--app-accent-press)" }}
                title="Untappd community rating"
              >
                ★ {row.rating.toFixed(2)}
              </span>
              {row.untappd && (
                <a
                  href={row.untappd}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${row.name} on Untappd`}
                  className="tap-44 relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        Untappd community ratings, July 2026 snapshot. Review counts vary; treat
        the order as a strong hint, not a verdict.
      </p>
    </section>
  );
}
