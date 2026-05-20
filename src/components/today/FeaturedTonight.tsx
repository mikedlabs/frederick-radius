import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * Full-bleed photo hero card — the single most compelling place right now.
 * Picks the highest-rated open curated place that has a real Google photo,
 * renders it magazine-style with the photo as the backdrop. This is the
 * antidote to a text-stacked homepage.
 */
export default function FeaturedTonight({ place }: { place: PlaceCardData | null }) {
  if (!place || !place.google_photo_url) return null;
  const cat = CATEGORY_BY_SLUG[place.category];

  return (
    <Link
      href={`/places/${place.slug}`}
      className="hover-lift tactile-feature group relative block overflow-hidden rounded-[var(--app-radius-xl)]"
      aria-label={`Featured: ${place.name}`}
    >
      <div className="relative h-60 w-full sm:h-72">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={place.google_photo_url}
          alt={cat?.name ? `${place.name} — ${cat.name}` : place.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="eager"
        />
        {/* Legibility gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />

        {/* Top row — eyebrow + rating */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur"
            style={{ background: `${cat?.color ?? "#C4451C"}D0` }}
          >
            Featured tonight
          </span>
          {place.google_rating !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
              <Star className="h-3 w-3 fill-current" style={{ color: "var(--app-accent)" }} aria-hidden />
              {place.google_rating.toFixed(1)}
              {place.google_rating_count ? (
                <span className="opacity-70">({place.google_rating_count.toLocaleString()})</span>
              ) : null}
            </span>
          )}
        </div>

        {/* Bottom — name + blurb */}
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-80">
            {cat?.name ?? place.category}
          </p>
          <h2 className="mt-0.5 flex items-center gap-2 font-serif text-[26px] font-semibold leading-tight tracking-tight">
            <span className="truncate">{place.name}</span>
            <ArrowUpRight
              className="h-5 w-5 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2}
              aria-hidden
            />
          </h2>
          <p className="mt-1 line-clamp-2 max-w-lg text-[13px] leading-snug opacity-85">
            {place.short_blurb}
          </p>
        </div>
      </div>
    </Link>
  );
}
