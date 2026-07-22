"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BREWERIES } from "@/data/beers";
import { BREWERY_EXPERIENCES, type BreweryFeature } from "@/data/brewery-experiences";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { BreweryPhoto, type BreweryPhotoMap } from "@/components/beer/BreweryPhoto";

/**
 * BreweryStrip — "where do I go to drink this," answered with PHOTOGRAPHS
 * instead of a logo-tab directory (owner: the beer page needs "much better
 * visuals for the photos," "less like a directory"). A horizontal snap-scroll
 * of tall photo cards, each a real taproom shot under a scrim with the brewery
 * name and town; a feature chip row narrows the set (food, outside, dogs…).
 * Tapping a card goes to the canonical brewery page.
 */

const FEATURE_CHIPS: { key: BreweryFeature; label: string }[] = [
  { key: "food", label: "Food" },
  { key: "outdoor", label: "Outside" },
  { key: "downtown", label: "Downtown" },
  { key: "dog-friendly", label: "Dogs" },
  { key: "family-friendly", label: "Families" },
  { key: "live-music", label: "Live music" },
];

const FEATURES_BY_SLUG: Record<string, readonly BreweryFeature[]> = Object.fromEntries(
  BREWERY_EXPERIENCES.map((e) => [e.slug, e.features]),
);

function townName(slug: string): string {
  return MUNICIPALITY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ");
}

export default function BreweryStrip({ photos }: { photos: BreweryPhotoMap }) {
  const [feature, setFeature] = useState<BreweryFeature | null>(null);

  const cards = useMemo(() => {
    return BREWERIES.map((b) => ({
      slug: b.slug,
      name: b.name,
      town: townName(b.town),
      beers: b.beers.length,
      photo: photos[b.slug] ?? null,
      features: FEATURES_BY_SLUG[b.slug] ?? [],
    })).filter((c) => (feature ? c.features.includes(feature) : true));
  }, [photos, feature]);

  return (
    <section aria-labelledby="brewery-strip-heading" className="text-[var(--app-ink)]">
      <div className="px-0.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-amber-text)]">The taprooms</p>
        <h2 id="brewery-strip-heading" className="mt-1 font-serif text-[28px] leading-none tracking-[-0.03em] sm:text-[34px]">
          Find a brewery.
        </h2>
      </div>

      {/* Feature filter chips */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => setFeature(null)}
          aria-pressed={feature === null}
          className={`min-h-11 shrink-0 rounded-full px-3 text-[12px] font-semibold transition ${
            feature === null ? "bg-[var(--app-ink)] text-[var(--app-on-brand)]" : "border border-[var(--app-border)] bg-[var(--app-bg-elevated-solid)] text-[var(--app-ink-2)]"
          }`}
        >
          All {BREWERIES.length}
        </button>
        {FEATURE_CHIPS.map((chip) => {
          const on = feature === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFeature(on ? null : chip.key)}
              aria-pressed={on}
              className={`min-h-11 shrink-0 rounded-full px-3 text-[12px] font-semibold transition ${
                on ? "bg-[var(--app-ink)] text-[var(--app-on-brand)]" : "border border-[var(--app-border)] bg-[var(--app-bg-elevated-solid)] text-[var(--app-ink-2)]"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        This filter has {cards.length} {cards.length === 1 ? "brewery" : "breweries"}.
      </p>

      {/* Photo card rail */}
      {cards.length > 0 ? (
        <ul id="brewery-strip-results" className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
          {cards.map((c) => (
            <li key={c.slug} className="shrink-0 snap-start">
              <Link
                href={`/places/${c.slug}`}
                className="group relative block aspect-[4/5] w-[72vw] max-w-[300px] overflow-hidden rounded-[16px]"
              >
                <BreweryPhoto
                  brewerySlug={c.slug}
                  breweryName={c.name}
                  src={c.photo}
                  decorative
                  sizes="(max-width: 640px) 72vw, 300px"
                  className="absolute inset-0 h-full w-full"
                  imageClassName="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                {/* Scrim so the name always clears its photo. */}
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, rgba(18,13,9,0.86) 0%, rgba(18,13,9,0.20) 42%, transparent 66%)" }}
                />
                <span className="absolute inset-x-0 bottom-0 p-4">
                  <span className="block font-serif text-[24px] leading-tight tracking-[-0.02em] text-[var(--app-on-brand)]">
                    {c.name}
                  </span>
                  <span className="mt-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--app-paper-2)]">
                    {c.town} · {c.beers} beer{c.beers === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)] px-4 py-8 text-center text-[13px] text-[var(--app-ink-3)]" style={{ borderColor: "var(--app-border)" }}>
          No breweries match that filter yet.
        </p>
      )}
    </section>
  );
}
