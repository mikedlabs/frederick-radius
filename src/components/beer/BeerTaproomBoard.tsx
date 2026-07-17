"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight, Check, ChevronRight, Clock3, MapPin } from "lucide-react";
import {
  BREWERIES,
  BREWERY_BY_SLUG,
  FAMILY_BY_KEY,
  type Brewery,
} from "@/data/beers";
import {
  BREWERY_EXPERIENCES,
  BREWERY_SOURCE_CHECKED_AT,
  type BreweryExperience,
  type BreweryFeature,
} from "@/data/brewery-experiences";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { PlaceCardData } from "@/lib/loaders/places";
import { BreweryLogo } from "./BreweryLogo";
import { BreweryPhoto } from "./BreweryPhoto";

type OpenRow = {
  slug: string;
  name: string;
  fact: string;
  where: string | null;
};

type OpenPayload = {
  hero: OpenRow | null;
  also: OpenRow[];
};

type BoardFilter = "all" | "open" | "menu" | "farm-country" | BreweryFeature;

const FILTERS: ReadonlyArray<{ key: BoardFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "open", label: "Open now" },
  { key: "menu", label: "Live menus" },
  { key: "food", label: "Food" },
  { key: "outdoor", label: "Outside" },
  { key: "dog-friendly", label: "Dogs" },
  { key: "live-music", label: "Music" },
  { key: "family-friendly", label: "Family" },
  { key: "farm-country", label: "Farm" },
];

const FEATURE_LABEL: Readonly<Record<BreweryFeature, string>> = {
  food: "Food",
  "byo-food": "Bring food",
  outdoor: "Outside",
  "dog-friendly": "Dogs",
  "family-friendly": "Family",
  "live-music": "Live music",
  "non-beer": "Non-beer",
  "to-go": "To go",
  downtown: "Downtown",
};

const DEFAULT_SLUG = "attaboy-beer-frederick";

function townName(slug: string): string {
  return MUNICIPALITY_BY_SLUG[slug]?.name
    ?? slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function signaturePours(brewery: Brewery) {
  const flagships = brewery.beers.filter((beer) => beer.flagship);
  return (flagships.length >= 3 ? flagships : brewery.beers).slice(0, 3);
}

function matchesFilter(
  experience: BreweryExperience,
  filter: BoardFilter,
  openSlugs: ReadonlySet<string>,
): boolean {
  if (filter === "all") return true;
  if (filter === "open") return openSlugs.has(experience.slug);
  if (filter === "menu") return Boolean(experience.tapListUrl);
  if (filter === "farm-country") return experience.scene === "farm-country";
  return experience.features.includes(filter);
}

export default function BeerTaproomBoard({ places }: { places: PlaceCardData[] }) {
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [selectedSlug, setSelectedSlug] = useState(DEFAULT_SLUG);
  const [openRows, setOpenRows] = useState<OpenRow[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/want?c=breweries", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: OpenPayload | null) => {
        if (!payload) return;
        setOpenRows(
          [payload.hero, ...payload.also].filter(
            (row): row is OpenRow => Boolean(row),
          ),
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const placeBySlug = useMemo(
    () => new Map(places.map((place) => [place.slug, place])),
    [places],
  );
  const openBySlug = useMemo(
    () => new Map(openRows.map((row) => [row.slug, row])),
    [openRows],
  );
  const openSlugs = useMemo(() => new Set(openBySlug.keys()), [openBySlug]);
  const visible = BREWERY_EXPERIENCES.filter((experience) =>
    matchesFilter(experience, filter, openSlugs),
  );
  const activeSlug = visible.some((experience) => experience.slug === selectedSlug)
    ? selectedSlug
    : visible[0]?.slug ?? DEFAULT_SLUG;
  const experience = BREWERY_EXPERIENCES.find((item) => item.slug === activeSlug)
    ?? BREWERY_EXPERIENCES[0];
  const brewery = BREWERY_BY_SLUG[activeSlug] ?? BREWERIES[0];
  const place = placeBySlug.get(activeSlug);
  const openRow = openBySlug.get(activeSlug);
  const pours = signaturePours(brewery);
  const leadFamily = FAMILY_BY_KEY[pours[0]?.family ?? "lager-pilsner"];
  const selectedNumber = Math.max(1, BREWERIES.findIndex((item) => item.slug === activeSlug) + 1);
  const selectionStyle = {
    "--beer-accent": leadFamily.base,
    "--beer-deep": leadFamily.deep,
  } as CSSProperties;

  return (
    <section
      id="taproom-board"
      aria-labelledby="taproom-board-heading"
      className="-mx-4 scroll-mt-24 border-y border-black/15 bg-[#15130f] text-[#f7f0e4] sm:-mx-5 lg:mx-0 lg:overflow-hidden lg:rounded-[10px] lg:border"
    >
      <header className="grid gap-6 px-5 pb-5 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-10 lg:pb-7 lg:pt-10">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#e3b65d]">The tap wall</p>
          <h2 id="taproom-board-heading" className="mt-2 max-w-[15ch] font-serif text-[clamp(2.7rem,8vw,5.4rem)] font-semibold leading-[0.87] tracking-[-0.055em]">
            Pull a handle.<br />Meet the room.
          </h2>
          <p className="mt-4 max-w-[38rem] text-[13px] leading-relaxed text-white/58 sm:text-[15px]">
            Every local brewery is on the rail. Filter by what matters, then tap a handle for the useful part.
          </p>
        </div>
        <div className="flex items-end justify-between gap-8 border-t border-white/10 pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/62">On the rail</p>
            <p className="mt-1 font-serif text-[34px] leading-none">{visible.length}</p>
          </div>
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/62">Open signal</p>
            <p className="mt-1 font-serif text-[34px] leading-none">{openRows.length || "–"}</p>
          </div>
        </div>
      </header>

      <div className="border-y border-white/10 px-5 sm:px-8 lg:px-10">
        <div className="flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter taprooms">
          {FILTERS.map((option) => {
            const disabled = option.key === "open" && openRows.length === 0;
            const count = BREWERY_EXPERIENCES.filter((item) =>
              matchesFilter(item, option.key, openSlugs),
            ).length;
            const selected = option.key === filter;
            return (
              <button
                key={option.key}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => setFilter(option.key)}
                className="relative min-h-12 min-w-11 shrink-0 py-1 text-[11px] font-semibold text-white/48 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                style={{ color: selected ? "#f3d496" : undefined }}
              >
                {option.label} <span className="font-mono text-[8px] opacity-80">{option.key === "open" && disabled ? "…" : count}</span>
                {selected ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#e3b65d]" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="text-[14px] text-white/62">Nothing on this rail matches right now.</p>
          <button type="button" onClick={() => setFilter("all")} className="mt-4 min-h-11 border-b border-[#e3b65d] text-[12px] font-semibold text-[#f3d496]">
            Reset the wall
          </button>
        </div>
      ) : (
        <>
          <div className="beer-tap-wall relative overflow-hidden border-b border-white/10">
            <div className="beer-tap-rail" aria-hidden />
            <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-[calc(50vw-58px)] pb-7 pt-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-8 lg:px-10" aria-label={`${visible.length} matching brewery tap handles`}>
              {visible.map((item) => {
                const itemBrewery = BREWERY_BY_SLUG[item.slug];
                if (!itemBrewery) return null;
                const selected = item.slug === activeSlug;
                const isOpen = openSlugs.has(item.slug);
                return (
                  <button
                    key={item.slug}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Choose ${itemBrewery.name}${isOpen ? ", hours say open" : ""}`}
                    onClick={() => setSelectedSlug(item.slug)}
                    className={`beer-tap group w-[108px] shrink-0 snap-center text-center ${selected ? "is-selected" : ""}`}
                  >
                    <span className="beer-tap-badge">
                      <BreweryLogo
                        brewerySlug={item.slug}
                        breweryName={itemBrewery.name}
                        decorative
                        sizes="74px"
                        className="h-full w-full object-contain"
                      />
                      {isOpen ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border-2 border-[#15130f] bg-[#65a565]" aria-hidden><Check className="h-2.5 w-2.5 text-white" strokeWidth={3} /></span> : null}
                    </span>
                    <span className="beer-tap-stem" aria-hidden><span /></span>
                    <span className="mt-2 line-clamp-2 block min-h-[2.35em] text-[10.5px] font-semibold leading-[1.16] text-white/62 transition group-hover:text-white/90">{itemBrewery.name}</span>
                    <span className="mt-1 block font-mono text-[7.5px] uppercase tracking-[0.09em] text-white/30">
                      {isOpen ? "Open" : item.tapListUrl ? "Menu linked" : townName(itemBrewery.town)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="pointer-events-none absolute bottom-3 right-4 flex items-center gap-1 font-mono text-[7px] uppercase tracking-[0.12em] text-white/62 sm:hidden">
              Slide the rail <ChevronRight className="h-3 w-3" aria-hidden />
            </p>
          </div>

          <article
            key={activeSlug}
            aria-live="polite"
            className="beer-tap-detail relative overflow-hidden"
            style={selectionStyle}
          >
            <div className="beer-tap-detail-glow" aria-hidden />
            <div className="relative h-[250px] overflow-hidden border-b border-white/12 sm:h-[310px]">
              <BreweryPhoto
                brewerySlug={activeSlug}
                breweryName={brewery.name}
                src={place?.google_photo_url}
                decorative
                sizes="(max-width: 1024px) 100vw, 840px"
                className="h-full w-full"
                imageClassName="object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,10,7,.08)_10%,rgba(13,10,7,.28)_48%,rgba(13,10,7,.94)_100%)]" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 px-5 pb-6 sm:px-8 sm:pb-8 lg:px-10">
                <div className="min-w-0">
                  <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#f3d496]">Tap {String(selectedNumber).padStart(2, "0")} · {townName(brewery.town)}</p>
                  <h3 className="mt-2 max-w-[13ch] font-serif text-[clamp(2.6rem,8vw,5rem)] font-semibold leading-[0.85] tracking-[-0.055em] text-white">{brewery.name}</h3>
                </div>
                <BreweryLogo brewerySlug={activeSlug} breweryName={brewery.name} decorative sizes="88px" className="h-[72px] w-[72px] shrink-0 bg-[#f8f4eb] object-contain p-2 shadow-[0_14px_34px_rgba(0,0,0,.34)] sm:h-[88px] sm:w-[88px]" />
              </div>
            </div>
            <div className="relative grid gap-8 px-5 py-7 sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(290px,.9fr)] lg:px-10 lg:py-10">
              <div>
                <p className="flex items-start gap-2 text-[11px] text-white/48">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{place?.address ?? townName(brewery.town)}</span>
                </p>
                <p className="mt-5 max-w-[42rem] text-[14px] leading-relaxed text-white/74">{experience.story}</p>

                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2" aria-label="Confirmed taproom features">
                  {experience.features.map((feature) => (
                    <span key={feature} className="flex items-center gap-1.5 text-[10px] font-semibold text-white/58">
                      <span className="h-1 w-1 rounded-full bg-[#f3d496]" aria-hidden />
                      {FEATURE_LABEL[feature]}
                    </span>
                  ))}
                </div>

                {openRow ? (
                  <p className="mt-5 flex items-center gap-2 text-[11px] font-bold text-[#d9f2c7]">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden />
                    Hours say {openRow.fact.toLowerCase()}
                  </p>
                ) : null}
                {experience.statusNote ? <p className="mt-4 max-w-[42rem] border-l border-amber-200/50 pl-3 text-[10px] leading-relaxed text-amber-50/70">{experience.statusNote}</p> : null}

                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Link href={`/places/${activeSlug}`} className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#f7f0e4] px-5 text-[12px] font-bold text-[#17130e] transition hover:bg-white">
                    Visit the taproom guide <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  {experience.tapListUrl ? (
                    <a href={experience.tapListUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 border border-white/32 px-5 text-[12px] font-semibold text-white transition hover:border-white/60 hover:bg-white/5">
                      See the current list <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-white/16 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-[8px] font-bold uppercase tracking-[0.17em] text-white/62">Three to know</p>
                  {place?.google_rating ? <span className="font-mono text-[9px] text-white/62">Google {place.google_rating.toFixed(1)}</span> : null}
                </div>
                <ol className="mt-3 divide-y divide-white/14">
                  {pours.map((beer, index) => {
                    const family = FAMILY_BY_KEY[beer.family];
                    return (
                      <li key={beer.name} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 py-4">
                        <span className="font-serif text-[22px] text-white/24">{index + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold">{beer.name}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-white/50">{beer.style} · {family.label}</span>
                        </span>
                        {beer.abv != null ? <span className="font-mono text-[9px] text-white/46">{beer.abv.toFixed(1)}%</span> : null}
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-5 flex gap-2 text-[9px] leading-relaxed text-white/62">
                  <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span>Features checked {BREWERY_SOURCE_CHECKED_AT}. Signature beers are a guide, not a live tap claim.</span>
                </p>
                <a href={experience.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 text-[9px] font-semibold text-white/52 hover:text-white/80">
                  Check the brewery source <ArrowUpRight className="h-3 w-3" aria-hidden />
                </a>
              </div>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
