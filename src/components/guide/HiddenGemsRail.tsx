import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { publicPlaces, decoratePlace, type PlaceCardData } from "@/lib/loaders/places";
import { HIDDEN_GEM_SLUGS } from "@/data/hidden-gems";
import PlaceCard from "@/components/place/PlaceCard";

/**
 * HiddenGemsRail — a small editorial discovery beat for /guide.
 *
 * The 8 curated hidden gems (hidden-gems.ts) already earn a "Hidden gem"
 * chip wherever their card appears; this gives them a deliberate home so
 * they're discoverable, not just stumbled-upon. Typographic cards (no
 * photos, per the photo policy), no distance (these are county-wide finds,
 * not "near me"), capped to a short rail with a link to the full
 * collection. Self-hides if the curated set somehow doesn't resolve.
 */
export default function HiddenGemsRail() {
  const bySlug = new Map(publicPlaces().map((p) => [p.slug, p]));
  // Preserve the curated order from HIDDEN_GEM_SLUGS; skip any that don't
  // resolve. No origin → no distance chip (a hidden gem isn't a "5 min
  // walk" pitch). Cap the rail at 6; the rest live in the collection.
  const gems: PlaceCardData[] = [...HIDDEN_GEM_SLUGS]
    .map((slug) => bySlug.get(slug))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, 6)
    .map((p) => decoratePlace(p));

  if (gems.length < 3) return null;

  return (
    <section className="mt-8 space-y-2.5" aria-label="Hidden gems">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Hidden gems
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Small finds locals actually remember.
          </p>
        </div>
        <Link
          href="/collections/hidden-gems"
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          See all
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Link>
      </div>
      {/* Horizontal rail — edge-to-edge, snap-stop, typographic tiles. */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ol className="flex snap-x snap-mandatory gap-3 pb-1">
          {gems.map((p) => (
            <li key={p.slug} className="snap-start">
              <PlaceCard place={p} variant="tile" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
