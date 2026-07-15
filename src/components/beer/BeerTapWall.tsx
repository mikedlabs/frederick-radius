"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  BREWERIES,
  BREWERY_BY_SLUG,
  FAMILY_BY_KEY,
  type Brewery,
} from "@/data/beers";
import {
  BREWERY_EXPERIENCE_BY_SLUG,
  BREWERY_EXPERIENCES,
  type BreweryScene,
} from "@/data/brewery-experiences";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { BreweryLogo } from "./BreweryLogo";
import styles from "./BeerTapWall.module.css";

type WallFilter = "all" | BreweryScene;

const FILTERS: ReadonlyArray<{ key: WallFilter; label: string }> = [
  { key: "all", label: "All taps" },
  { key: "carroll-creek", label: "Carroll Creek" },
  { key: "city-taprooms", label: "City rooms" },
  { key: "farm-country", label: "Farm country" },
  { key: "destination-stops", label: "County stops" },
];

const DEFAULT_BREWERY_SLUG = "attaboy-beer-frederick";

function townName(slug: string): string {
  return MUNICIPALITY_BY_SLUG[slug]?.name
    ?? slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function signaturePours(brewery: Brewery) {
  const flagships = brewery.beers.filter((beer) => beer.flagship);
  return (flagships.length >= 3 ? flagships : brewery.beers).slice(0, 3);
}

export default function BeerTapWall() {
  const [filter, setFilter] = useState<WallFilter>("all");
  const [selectedSlug, setSelectedSlug] = useState(DEFAULT_BREWERY_SLUG);

  const visibleExperiences = filter === "all"
    ? BREWERY_EXPERIENCES
    : BREWERY_EXPERIENCES.filter((experience) => experience.scene === filter);
  const selectedIsVisible = visibleExperiences.some((experience) => experience.slug === selectedSlug);
  const activeSlug = selectedIsVisible ? selectedSlug : visibleExperiences[0]?.slug ?? DEFAULT_BREWERY_SLUG;
  const activeBrewery = BREWERY_BY_SLUG[activeSlug] ?? BREWERIES[0];
  const activeExperience = BREWERY_EXPERIENCE_BY_SLUG[activeSlug];
  const pours = signaturePours(activeBrewery);
  const pourColor = pours[0] ? FAMILY_BY_KEY[pours[0].family].base : "#c99a4b";

  return (
    <section className={styles.room} aria-labelledby="beer-wall-title">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Frederick County beer / tap wall 01</p>
          <h1 id="beer-wall-title" className={styles.title}>
            Frederick,
            <span className={styles.titleAccent}>on tap.</span>
          </h1>
          <p className={styles.intro}>
            Seventeen brewery guides, lined up like the room they belong in. Pull a handle to meet the place and see a few signature pours.
          </p>
        </div>
        <div className={styles.headerAside}>
          <span className={styles.edition}>The local board</span>
          <strong className={styles.bigCount}>{BREWERIES.length}</strong>
          <span className={styles.count}>brewery handles</span>
        </div>
      </header>

      <div className={styles.filters} role="group" aria-label="Filter brewery tap handles by setting">
        {FILTERS.map((option) => {
          const active = option.key === filter;
          const count = option.key === "all"
            ? BREWERY_EXPERIENCES.length
            : BREWERY_EXPERIENCES.filter((experience) => experience.scene === option.key).length;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(option.key)}
              className={`${styles.filter} ${active ? styles.filterActive : ""}`}
            >
              {option.label} · {count}
            </button>
          );
        })}
      </div>

      <div className={styles.board}>
        <div className={styles.boardTopline}>
          <p className={styles.boardHint}>Choose a brewery</p>
          <p className={styles.boardHint}>Drag to see the full wall</p>
        </div>
        <div className={styles.tapScroller}>
          {visibleExperiences.map((experience) => {
            const brewery = BREWERY_BY_SLUG[experience.slug];
            if (!brewery) return null;
            const active = brewery.slug === activeSlug;
            return (
              <div key={brewery.slug} className={styles.tapItem}>
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`Pull ${brewery.name} tap`}
                  onClick={() => setSelectedSlug(brewery.slug)}
                  className={`${styles.tapButton} ${active ? styles.tapButtonActive : ""}`}
                >
                  <span className={styles.tapHandle}>
                    <span className={styles.tapBadge}>
                      <BreweryLogo
                        brewerySlug={brewery.slug}
                        breweryName={brewery.name}
                        decorative
                        sizes="100px"
                        className={styles.logo}
                      />
                    </span>
                    <span className={styles.neck} aria-hidden>
                      <span className={styles.collar} />
                    </span>
                  </span>
                  <span className={styles.tapName}>{brewery.name}</span>
                </button>
              </div>
            );
          })}
        </div>
        <span className={styles.rail} aria-hidden />
      </div>

      <article
        key={activeBrewery.slug}
        className={styles.detail}
        style={{ "--pour-color": pourColor } as CSSProperties}
        aria-live="polite"
      >
        <div className={styles.detailCopy}>
          <p className={styles.detailLabel}>Now pulled</p>
          <h2 className={styles.detailTitle}>{activeBrewery.name}</h2>
          <p className={styles.town}>{townName(activeBrewery.town)} · Frederick County</p>
          <p className={styles.story}>{activeExperience?.story ?? activeBrewery.focus}</p>
          {activeExperience?.traits.length ? (
            <div className={styles.traits} aria-label="Brewery features">
              {activeExperience.traits.map((trait) => (
                <span key={trait} className={styles.trait}>{trait}</span>
              ))}
            </div>
          ) : null}
          <Link href={`/places/${activeBrewery.slug}`} className={styles.guideLink}>
            Open brewery guide
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </Link>
          {activeExperience?.statusNote ? <p className={styles.status}>{activeExperience.statusNote}</p> : null}
        </div>

        <div className={styles.pours}>
          <div className={styles.poursHeader}>
            <p className={styles.detailLabel}>Signature pours</p>
            <span className={styles.edition}>Not a live tap list</span>
          </div>
          <ol className={styles.pourList}>
            {pours.map((beer, index) => (
              <li key={beer.name} className={styles.pour}>
                <span className={styles.pourNumber}>0{index + 1}</span>
                <span className="min-w-0">
                  <span className={styles.pourName}>{beer.name}</span>
                  <span className={styles.pourMeta}>{beer.style}</span>
                </span>
                {beer.abv != null ? <span className={styles.abv}>{beer.abv.toFixed(1)}%</span> : null}
              </li>
            ))}
          </ol>
        </div>
      </article>
    </section>
  );
}
