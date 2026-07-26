"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BREWERIES } from "@/data/beers";
import {
  BREWERY_EXPERIENCE_BY_SLUG,
  BREWERY_EXPERIENCES,
  type BreweryFeature,
} from "@/data/brewery-experiences";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { BreweryPhoto, type BreweryPhotoMap } from "@/components/beer/BreweryPhoto";

/**
 * BreweryStrip — "where do I go to drink this," answered with PHOTOGRAPHS
 * instead of a logo-tab directory (owner: the beer page needs "much better
 * visuals for the photos," "less like a directory"). A horizontal snap-scroll
 * of concise photo cards with source-checked taproom context. The first action
 * always opens Radius's native place detail; external menus remain deeper.
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
      photo: photos[b.slug] ?? null,
      features: FEATURES_BY_SLUG[b.slug] ?? [],
      story: BREWERY_EXPERIENCE_BY_SLUG[b.slug]?.story ??
        "A Frederick County brewery with a Radius place guide.",
      needsConfirmation: Boolean(BREWERY_EXPERIENCE_BY_SLUG[b.slug]?.statusNote),
    })).filter((c) => (feature ? c.features.includes(feature) : true));
  }, [photos, feature]);

  return (
    <section aria-labelledby="brewery-strip-heading" className="text-[var(--app-ink)]">
      <div className="px-0.5">
        <h2 id="brewery-strip-heading" className="font-sans text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[32px]">
          Choose a brewery
        </h2>
      </div>

      {/* Feature filter chips */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => setFeature(null)}
          aria-pressed={feature === null}
          className="min-h-11 shrink-0 rounded-full border px-3 text-[12px] font-semibold transition"
          style={{
            borderColor: feature === null ? "var(--app-amber-text)" : "var(--app-border)",
            background: feature === null
              ? "color-mix(in srgb, var(--app-amber) 14%, var(--app-bg-elevated-solid))"
              : "var(--app-bg-elevated-solid)",
            color: "var(--app-ink)",
          }}
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
              className="min-h-11 shrink-0 rounded-full border px-3 text-[12px] font-semibold transition"
              style={{
                borderColor: on ? "var(--app-amber-text)" : "var(--app-border)",
                background: on
                  ? "color-mix(in srgb, var(--app-amber) 14%, var(--app-bg-elevated-solid))"
                  : "var(--app-bg-elevated-solid)",
                color: "var(--app-ink)",
              }}
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
                className="group block w-[82vw] max-w-[340px] overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] outline-none shadow-[var(--app-elev-1)] transition hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                style={{ borderColor: "var(--app-border)" }}
              >
                <BreweryPhoto
                  brewerySlug={c.slug}
                  breweryName={c.name}
                  photo={c.photo}
                  decorative
                  sizes="(max-width: 640px) 82vw, 340px"
                  className="h-[156px] w-full border-b border-[var(--app-border)] sm:h-[184px]"
                  imageClassName="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <span className="block p-4">
                  <span className="block font-sans text-[18px] font-semibold leading-tight tracking-[-0.02em] text-[var(--app-ink)]">
                    {c.name}
                  </span>
                  <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--app-ink-3)]">
                    {c.town}
                  </span>
                  <span className="mt-2 block line-clamp-3 min-h-[3.75rem] text-[12px] leading-relaxed text-[var(--app-ink-2)]">
                    {c.story}
                  </span>
                  <span className="mt-3 flex min-h-8 items-center justify-between gap-3 border-t pt-2 text-[11.5px] font-semibold text-[var(--app-brand-press)]" style={{ borderColor: "var(--app-border)" }}>
                    {c.needsConfirmation ? "Check current details" : "View taproom details"}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} aria-hidden />
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
