"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Clock3, MapPin } from "lucide-react";
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
import BeerTapHandle from "./BeerTapHandle";
import styles from "./BeerTaproomBoard.module.css";

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

type OpenStatus = "loading" | "ready" | "unavailable";

type BoardFilter = "all" | "open" | "menu" | "farm-country" | BreweryFeature;

const FILTERS: ReadonlyArray<{ key: BoardFilter; label: string }> = [
  { key: "open", label: "Listed open" },
  { key: "all", label: "All" },
  { key: "menu", label: "Tap list links" },
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
  return (flagships.length >= 4 ? flagships : brewery.beers).slice(0, 4);
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
  const [openStatus, setOpenStatus] = useState<OpenStatus>("loading");
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/want?c=breweries", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Taproom hours request failed: ${response.status}`);
        return response.json();
      })
      .then((payload: OpenPayload | null) => {
        if (!payload) throw new Error("Taproom hours response was empty");
        setOpenRows(
          [payload.hero, ...payload.also].filter(
            (row): row is OpenRow => Boolean(row),
          ),
        );
        setOpenStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setOpenStatus("unavailable");
      });
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
  const listedOpenCount = BREWERY_EXPERIENCES.filter((item) => openSlugs.has(item.slug)).length;
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
  const activeVisibleIndex = Math.max(0, visible.findIndex((item) => item.slug === activeSlug));
  const selectionStyle = {
    "--beer-accent": leadFamily.base,
    "--beer-deep": leadFamily.deep,
  } as CSSProperties;

  function selectVisibleIndex(index: number, focus = false) {
    if (visible.length === 0) return;
    const wrappedIndex = (index + visible.length) % visible.length;
    const next = visible[wrappedIndex];
    if (!next) return;
    setSelectedSlug(next.slug);
    const button = handleRefs.current.get(next.slug);
    if (focus) {
      button?.focus();
    }
    button?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function handleTapKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectVisibleIndex(index + 1, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectVisibleIndex(index - 1, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectVisibleIndex(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      selectVisibleIndex(visible.length - 1, true);
    }
  }

  return (
    <section
      id="taproom-board"
      aria-labelledby="taproom-board-heading"
      className="-mx-4 scroll-mt-24 border-y border-black/15 bg-[#f2e8d5] text-[#281e14] sm:-mx-5 lg:mx-0 lg:overflow-hidden lg:rounded-[10px] lg:border"
    >
      <header className="grid gap-4 px-5 pb-3 pt-5 sm:gap-6 sm:px-8 sm:pb-6 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-10 lg:pb-7 lg:pt-10">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#85501f]">Frederick County breweries</p>
          <h2 id="taproom-board-heading" className="mt-2 max-w-[16ch] font-serif text-[clamp(2.1rem,9vw,5rem)] font-semibold leading-[0.9] tracking-[-0.05em]">
            Choose a brewery that fits.
          </h2>
          <p className="mt-2 max-w-[38rem] text-[12px] leading-relaxed text-black/62 sm:mt-4 sm:text-[15px]">
            Filter by setting and features, then select a brewery for visit details and signature beers.
          </p>
        </div>
        <div className="hidden items-end justify-between gap-8 border-t border-black/10 pt-4 sm:flex lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-black/65">Matches</p>
            <p className="mt-1 font-serif text-[34px] leading-none">{visible.length}</p>
          </div>
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-black/65">Listed open</p>
            <p className="mt-1 font-serif text-[34px] leading-none">
              {openStatus === "loading" ? "…" : openStatus === "unavailable" ? "–" : listedOpenCount}
            </p>
          </div>
        </div>
      </header>

      <div className="border-y border-black/10 px-5 py-2 sm:px-8 sm:py-3 lg:px-10">
        <div className="mb-2 flex items-center justify-between gap-4 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-black/65">
          <span>Filter taprooms</span>
          <span aria-live="polite">{visible.length} match{visible.length === 1 ? "" : "es"}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter taprooms">
          {FILTERS.map((option) => {
            const disabled = option.key === "open" && (openStatus !== "ready" || listedOpenCount === 0);
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
                className="relative min-h-11 min-w-11 shrink-0 rounded-full border border-black/16 bg-white/35 px-3 py-1 text-[11px] font-semibold text-black/62 transition hover:border-black/35 hover:bg-white/60 hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
                style={{ color: selected ? "#fffaf2" : undefined, background: selected ? "#7b4722" : undefined, borderColor: selected ? "#7b4722" : undefined }}
              >
                {option.label}{" "}
                <span
                  className="font-mono text-[8px]"
                  style={{ color: selected ? "rgba(255,250,242,.9)" : "rgba(0,0,0,.68)" }}
                >
                  {option.key === "open" && openStatus === "loading" ? "…" : option.key === "open" && openStatus === "unavailable" ? "–" : count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="text-[14px] text-black/62">No taprooms match those filters.</p>
          <button type="button" onClick={() => setFilter("all")} className="mt-4 min-h-11 border-b border-[#9a5c26] text-[12px] font-semibold text-[#7b4722]">
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div id="taproom-wall" className="scroll-mt-20 flex items-center justify-between gap-4 border-b border-black/10 px-5 py-2 sm:px-8 sm:py-3 lg:px-10">
            <div>
              <p className="text-[12px] font-semibold text-black/78">Select a brewery.</p>
              <p className="mt-0.5 text-[10px] text-black/65">Swipe the brewery row or use the arrow buttons.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="min-w-[4.5rem] text-center font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-black/65">
                {activeVisibleIndex + 1} of {visible.length}
              </span>
              <button
                type="button"
                className={styles.navButton}
                aria-label="Previous brewery"
                onClick={() => selectVisibleIndex(activeVisibleIndex - 1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className={styles.navButton}
                aria-label="Next brewery"
                onClick={() => selectVisibleIndex(activeVisibleIndex + 1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <div className={styles.wall}>
            <div className={styles.backbar} aria-hidden />
            <div
              className={styles.scroller}
              role="tablist"
              aria-label={`${visible.length} matching breweries`}
              aria-orientation="horizontal"
            >
              {visible.map((item, index) => {
                const itemBrewery = BREWERY_BY_SLUG[item.slug];
                if (!itemBrewery) return null;
                const selected = item.slug === activeSlug;
                const isOpen = openSlugs.has(item.slug);
                const handlePours = signaturePours(itemBrewery);
                const handleFamily = FAMILY_BY_KEY[handlePours[0]?.family ?? "lager-pilsner"];
                return (
                  <BeerTapHandle
                    key={item.slug}
                    ref={(node) => {
                      if (node) handleRefs.current.set(item.slug, node);
                      else handleRefs.current.delete(item.slug);
                    }}
                    brewerySlug={item.slug}
                    breweryName={itemBrewery.name}
                    town={townName(itemBrewery.town)}
                    selected={selected}
                    listedOpen={isOpen}
                    pourColor={handleFamily.base}
                    eagerLogo={index < 7}
                    controlsId="taproom-detail-panel"
                    onSelect={() => selectVisibleIndex(index)}
                    onKeyDown={(event) => handleTapKeyDown(event, index)}
                  />
                );
              })}
            </div>
          </div>

          <p className="sr-only" aria-live="polite">The selected brewery is {brewery.name}.</p>

          <article
            key={activeSlug}
            id="taproom-detail-panel"
            role="tabpanel"
            aria-labelledby={`tap-handle-${activeSlug}`}
            tabIndex={0}
            className="beer-tap-detail relative overflow-hidden"
            style={selectionStyle}
          >
            <div className="beer-tap-detail-glow" aria-hidden />
            <div className="relative h-[200px] overflow-hidden border-b border-black/12 sm:h-[310px]">
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
                  <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#f3d496]">Brewery {String(selectedNumber).padStart(2, "0")} · {townName(brewery.town)}</p>
                  <h3 className="mt-2 max-w-[13ch] font-serif text-[clamp(2.2rem,8vw,5rem)] font-semibold leading-[0.87] tracking-[-0.05em] text-white">{brewery.name}</h3>
                </div>
                <BreweryLogo brewerySlug={activeSlug} breweryName={brewery.name} decorative sizes="88px" className="h-[72px] w-[72px] shrink-0 bg-[#f8f4eb] object-contain p-2 shadow-[0_14px_34px_rgba(0,0,0,.34)] sm:h-[88px] sm:w-[88px]" />
              </div>
            </div>
            <div className="relative grid gap-6 px-5 py-6 sm:gap-8 sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(290px,.9fr)] lg:px-10 lg:py-10">
              <div>
                <p className="flex items-start gap-2 text-[11px] text-black/65">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{place?.address ?? townName(brewery.town)}</span>
                </p>
                <p className="mt-4 line-clamp-3 max-w-[42rem] text-[13px] leading-relaxed text-black/74 sm:mt-5 sm:text-[14px]">{experience.story}</p>

                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2" aria-label="Taproom feature filters">
                  {experience.features.slice(0, 5).map((feature) => (
                    <span key={feature} className="flex items-center gap-1.5 text-[10px] font-semibold text-black/62">
                      <span className="h-1 w-1 rounded-full bg-[#9a5c26]" aria-hidden />
                      {FEATURE_LABEL[feature]}
                    </span>
                  ))}
                </div>

                {openRow ? (
                  <div className="mt-5">
                    <p className="flex items-center gap-2 text-[11px] font-bold text-[#37623e]">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden />
                      Listed hours say {openRow.fact.toLowerCase()}.
                    </p>
                    <p className="mt-1 text-[9px] text-black/65">Hours can change, so confirm before making a special trip.</p>
                  </div>
                ) : null}
                {experience.statusNote ? <p className="mt-4 max-w-[42rem] border-l border-[#b37534]/55 pl-3 text-[10px] leading-relaxed text-[#765126]">{experience.statusNote}</p> : null}

                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Link href={`/places/${activeSlug}`} className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#382517] px-5 text-[12px] font-bold text-[#fffaf2] transition hover:bg-[#24170f]">
                    Visit the taproom guide <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  {experience.tapListUrl ? (
                    <a href={experience.tapListUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 border border-black/26 bg-white/28 px-5 text-[12px] font-semibold text-[#281e14] transition hover:border-black/46 hover:bg-white/55">
                      Check the tap list <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-black/14 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-[8px] font-bold uppercase tracking-[0.17em] text-black/65">Signature pours</p>
                  {place?.google_rating ? <span className="font-mono text-[9px] text-black/65">Google {place.google_rating.toFixed(1)}</span> : null}
                </div>
                <ol className="mt-3 divide-y divide-black/12">
                  {pours.map((beer, index) => {
                    const family = FAMILY_BY_KEY[beer.family];
                    return (
                      <li key={beer.name} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 py-4">
                        <span className="font-serif text-[22px] text-black/45">{index + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold">{beer.name}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-black/65">{beer.style} · {family.label}</span>
                        </span>
                        {beer.abv != null ? <span className="font-mono text-[9px] text-black/65">{beer.abv.toFixed(1)}%</span> : null}
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-5 flex gap-2 text-[9px] leading-relaxed text-black/65">
                  <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span>Taproom details were checked against the linked brewery source on {BREWERY_SOURCE_CHECKED_AT}. Signature beers are a guide, not a live tap claim.</span>
                </p>
                <a href={experience.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 text-[9px] font-semibold text-black/60 hover:text-black/85">
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
