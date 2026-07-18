"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
} from "lucide-react";
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
  open?: OpenRow[];
};

type OpenStatus = "loading" | "ready" | "unavailable";
type BoardFilter = "all" | "open" | "farm-country" | BreweryFeature;

const FILTERS: ReadonlyArray<{ key: BoardFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "open", label: "Listed open" },
  { key: "food", label: "Food" },
  { key: "outdoor", label: "Outside" },
  { key: "downtown", label: "Downtown" },
  { key: "farm-country", label: "Farm breweries" },
  { key: "dog-friendly", label: "Dogs" },
  { key: "family-friendly", label: "Families" },
  { key: "live-music", label: "Live music" },
];

const FEATURE_LABEL: Readonly<Record<BreweryFeature, string>> = {
  food: "Food on site",
  "byo-food": "Bring your own food",
  outdoor: "Outdoor space",
  "dog-friendly": "Dogs welcome",
  "family-friendly": "Family friendly",
  "live-music": "Live music",
  "non-beer": "Non-beer drinks",
  "to-go": "Beer to go",
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
  if (filter === "farm-country") return experience.scene === "farm-country";
  return experience.features.includes(filter);
}

export default function BeerTaproomBoard({ places }: { places: PlaceCardData[] }) {
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [selectedSlug, setSelectedSlug] = useState(DEFAULT_SLUG);
  const [openRows, setOpenRows] = useState<OpenRow[]>([]);
  const [openStatus, setOpenStatus] = useState<OpenStatus>("loading");
  const choiceRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/want?c=breweries", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Brewery hours request failed: ${response.status}`);
        return response.json();
      })
      .then((payload: OpenPayload | null) => {
        if (!payload) throw new Error("Brewery hours response was empty");
        setOpenRows(
          payload.open ?? [payload.hero, ...payload.also].filter(
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
  const activeVisibleIndex = Math.max(0, visible.findIndex((item) => item.slug === activeSlug));

  function selectVisibleIndex(index: number, focus = false) {
    if (visible.length === 0) return;
    const wrappedIndex = (index + visible.length) % visible.length;
    const next = visible[wrappedIndex];
    if (!next) return;
    setSelectedSlug(next.slug);
    const button = choiceRefs.current.get(next.slug);
    if (focus) button?.focus();
    button?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }

  function handleChoiceKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
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
    <section id="taproom-wall" aria-labelledby="taproom-board-heading" className="scroll-mt-24">
      <header className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#85501f]">Breweries</p>
          <h2 id="taproom-board-heading" className="mt-1 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]">
            Find a brewery.
          </h2>
          <p className="mt-2 max-w-[38rem] text-[13px] leading-relaxed text-black/62">
            Filter by the things that matter for your visit. Select a brewery to see its location, source-checked features, and signature beers.
          </p>
        </div>
        <p className="text-[11px] text-black/65" aria-live="polite">
          {visible.length} of {BREWERY_EXPERIENCES.length} breweries
        </p>
      </header>

      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0" role="group" aria-label="Filter breweries">
        {FILTERS.map((option) => {
          const disabled = option.key === "open" && openStatus !== "ready";
          const selected = option.key === filter;
          return (
            <button
              key={option.key}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => setFilter(option.key)}
              className="min-h-11 shrink-0 rounded-full border px-3.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                color: selected ? "#fffaf2" : "rgba(40,30,20,.7)",
                background: selected ? "#70451f" : "rgba(255,252,245,.54)",
                borderColor: selected ? "#70451f" : "rgba(40,30,20,.16)",
              }}
            >
              {option.key === "open" && openStatus === "loading" ? "Checking hours…" : option.label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="mt-4 border-y border-black/12 py-10 text-center">
          <p className="text-[13px] text-black/62">No breweries match that filter right now.</p>
          <button type="button" onClick={() => setFilter("all")} className="mt-2 min-h-11 text-[12px] font-semibold text-[#70451f] underline underline-offset-4">
            Show every brewery
          </button>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[12px] border border-black/12 bg-[#f7f0e4]">
          <div className="flex items-center justify-between gap-3 border-b border-black/10 px-3 py-2 sm:px-4">
            <p className="text-[10px] text-black/65">Swipe the brewery logos to browse.</p>
            <div className="flex items-center gap-1.5">
              <span className="mr-1 font-mono text-[9px] text-black/65">{activeVisibleIndex + 1}/{visible.length}</span>
              <button type="button" className={styles.navButton} aria-label="Previous brewery" onClick={() => selectVisibleIndex(activeVisibleIndex - 1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className={styles.navButton} aria-label="Next brewery" onClick={() => selectVisibleIndex(activeVisibleIndex + 1)}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className={styles.rail} role="tablist" aria-label={`${visible.length} matching breweries`} aria-orientation="horizontal">
            {visible.map((item, index) => {
              const itemBrewery = BREWERY_BY_SLUG[item.slug];
              if (!itemBrewery) return null;
              const selected = item.slug === activeSlug;
              const listedOpen = openSlugs.has(item.slug);
              return (
                <button
                  key={item.slug}
                  ref={(node) => {
                    if (node) choiceRefs.current.set(item.slug, node);
                    else choiceRefs.current.delete(item.slug);
                  }}
                  id={`brewery-choice-${item.slug}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="brewery-detail-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectVisibleIndex(index)}
                  onKeyDown={(event) => handleChoiceKeyDown(event, index)}
                  className={`${styles.choice} ${selected ? styles.choiceSelected : ""}`}
                >
                  <span className={styles.logoFrame}>
                    <BreweryLogo
                      brewerySlug={item.slug}
                      breweryName={itemBrewery.name}
                      decorative
                      sizes="64px"
                      loading={index < 7 ? "eager" : "lazy"}
                      className={styles.logo}
                    />
                  </span>
                  <span className={styles.choiceName}>{itemBrewery.name}</span>
                  <span className={styles.choiceMeta}>{listedOpen ? "Listed open" : townName(itemBrewery.town)}</span>
                </button>
              );
            })}
          </div>

          <p className="sr-only" aria-live="polite">The selected brewery is {brewery.name}.</p>

          <article
            key={activeSlug}
            id="brewery-detail-panel"
            role="tabpanel"
            aria-labelledby={`brewery-choice-${activeSlug}`}
            tabIndex={0}
            className={styles.detail}
          >
            <div className={styles.detailBody}>
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[#85501f]">{townName(brewery.town)}</p>
                    <h3 className="mt-1 font-serif text-[30px] font-semibold leading-[0.95] tracking-[-0.035em] sm:text-[36px]">{brewery.name}</h3>
                  </div>
                  <BreweryLogo brewerySlug={activeSlug} breweryName={brewery.name} decorative sizes="64px" className={styles.selectedLogo} />
                </div>
                <p className="mt-3 flex items-start gap-2 text-[11px] text-black/58">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{place?.address ?? townName(brewery.town)}</span>
                </p>
                <p className="mt-4 max-w-[42rem] text-[13px] leading-relaxed text-black/70">{experience.story}</p>

                <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Source-checked brewery features">
                  {experience.features.slice(0, 6).map((feature) => (
                    <li key={feature} className="flex items-center gap-1.5 text-[10px] font-medium text-black/60">
                      <span className="h-1 w-1 rounded-full bg-[#9a5c26]" aria-hidden />
                      {FEATURE_LABEL[feature]}
                    </li>
                  ))}
                </ul>

                {openRow ? (
                  <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-[#37623e]">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden />
                    Listed hours say {openRow.fact.toLowerCase()}. Confirm before making a special trip.
                  </p>
                ) : null}
                {experience.statusNote ? <p className="mt-4 border-l border-[#b37534]/55 pl-3 text-[10px] leading-relaxed text-[#765126]">{experience.statusNote}</p> : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/places/${activeSlug}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#382517] px-4 text-[11px] font-bold text-[#fffaf2] transition hover:bg-[#24170f]">
                    Brewery details <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  {experience.tapListUrl ? (
                    <a href={experience.tapListUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-black/20 px-4 text-[11px] font-semibold text-[#281e14] transition hover:border-black/40 hover:bg-white/50">
                      Current tap list <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className={styles.pours}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[11px] font-semibold text-black/72">Signature beers</p>
                  {place?.google_rating ? <span className="text-[9px] text-black/65">Google {place.google_rating.toFixed(1)}</span> : null}
                </div>
                <ol className="mt-2 divide-y divide-black/10">
                  {pours.map((beer) => {
                    const family = FAMILY_BY_KEY[beer.family];
                    return (
                      <li key={beer.name} className="grid grid-cols-[8px_1fr_auto] items-center gap-2.5 py-3">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: family.base }} aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-semibold">{beer.name}</span>
                          <span className="mt-0.5 block truncate text-[9px] text-black/65">{beer.style}</span>
                        </span>
                        {beer.abv != null ? <span className="font-mono text-[9px] text-black/65">{beer.abv.toFixed(1)}%</span> : null}
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-3 flex gap-2 text-[9px] leading-relaxed text-black/65">
                  <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span>Details checked {BREWERY_SOURCE_CHECKED_AT}. Signature beers are not a live tap claim.</span>
                </p>
                <a href={experience.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1 text-[9px] font-semibold text-black/58 hover:text-black/82">
                  Brewery source <ArrowUpRight className="h-3 w-3" aria-hidden />
                </a>
              </div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
