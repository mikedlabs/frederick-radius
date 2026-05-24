import Link from "next/link";
import { MUNICIPALITIES } from "@/data/municipalities";
import { publicPlacesByMunicipality } from "@/lib/loaders/places";

// A deterministic System-Black accent per town so the grid reads as
// distinct tiles, not one grey list.
const ACCENTS = ["#C4451C", "#2A5D8F", "#1E6B3A", "#7E2C6F", "#B07A1E", "#3F5E8F"];
function accentFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

/**
 * All 12 towns as a visual tile grid (not a row of pills): each tile
 * carries the town name, a real place count, and a color spine so the
 * county reads as places, not a directory list.
 */
export default function MunicipalityStrip() {
  const towns = MUNICIPALITIES.map((m) => ({
    ...m,
    count: publicPlacesByMunicipality(m.slug).length,
  })).sort((a, b) => b.count - a.count);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {towns.map((m) => {
        const accent = accentFor(m.slug);
        return (
          <Link
            key={m.slug}
            href={`/m/${m.slug}`}
            className="hover-lift relative overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-2.5 pl-4 pr-3 transition"
            style={{ borderColor: "var(--app-border)" }}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: accent }}
            />
            <span className="block truncate text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              {m.name}
            </span>
            {/* The hero_blurb already lives on each municipality
                (used on /m/[slug] and search results). Surfacing it
                here makes the strip read as editorial rather than
                a list of names. Falls back to the place count if a
                town doesn't have a blurb yet. */}
            <span
              className="block truncate text-[11px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              {m.hero_blurb || (m.count > 0 ? `${m.count} ${m.count === 1 ? "place" : "places"}` : m.type)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
