"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import CategoryGraphic from "@/components/ui/CategoryGraphic";
import TodaySectionHeading from "@/components/today/TodaySectionHeading";
import type { DaypartPick, DaypartRow } from "@/lib/loaders/daypartPicks";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { getWantAnswer } from "@/lib/want-cache";
import { GEOLOCATION_CHANGE_EVENT } from "@/hooks/useGeolocation";
import {
  getScope,
  scopeToParam,
  SCOPE_CHANGE_EVENT,
  type Scope,
} from "@/lib/scope";
import Skeleton from "@/components/ui/Skeleton";

type WantRow = {
  slug: string;
  name: string;
  photo: string | null;
  where: string | null;
  distance: string | null;
  fact: string;
  confidence?: "confirmed" | "likely";
};

type WantAnswer = {
  hero: WantRow | null;
  also: WantRow[];
  browseHref: string;
  contextLabel: string;
  contextSource?: "town" | "device" | "home" | "ip" | "county" | "none";
};

export type LiveShelf = {
  picks: DaypartPick[];
  href: string;
  contextLabel: string;
  contextSource: NonNullable<WantAnswer["contextSource"]>;
};

/**
 * Keep Today's location-aware shelf and its expanded list on the same ranking
 * path. Exact device coordinates stay in session storage; the URL carries only
 * the noun/facet and the coarse browsing scope.
 */
export function daypartBrowseHref(
  category: string,
  label: string,
  scope: Scope | null = null,
): string | null {
  const normalizedLabel = label.toLowerCase();
  const target =
    category === "coffee"
      ? { craving: "coffee" }
      : category === "bakery"
        ? { craving: "breakfast" }
        : category === "restaurant"
          ? {
              craving: normalizedLabel.includes("lunch")
                ? "lunch"
                : normalizedLabel.includes("dinner")
                  ? "dinner"
                  : normalizedLabel.includes("still")
                    ? "late"
                    : "food",
            }
          : category === "brewery"
            ? { craving: "breweries" }
            : category === "bar"
              ? { craving: "drinks", facet: "bar" }
              : category === "ice-cream"
                ? { craving: "ice-cream" }
                : category === "museum"
                  ? { craving: "art", facet: "museum" }
                  : category === "book-store"
                    ? { craving: "shops", facet: "book-store" }
                    : null;
  if (!target) return null;

  const params = new URLSearchParams({ c: target.craving });
  if ("facet" in target && target.facet) params.set("facet", target.facet);
  if (scope) params.set("in", scopeToParam(scope));
  return `/nearby?${params.toString()}`;
}

/** Turn the live decision response into the shelf verbatim, including an empty
 * answer. A successful scoped zero is information; only a rejected request may
 * retain the countywide server fallback. */
export function liveShelfFromWantAnswer(
  answer: WantAnswer,
  row: DaypartRow,
  scope: Scope | null,
): LiveShelf {
  const picks = [answer.hero, ...answer.also]
    .filter((candidate): candidate is WantRow => Boolean(candidate))
    .slice(0, 4)
    .map((candidate) => ({
      slug: candidate.slug,
      name: candidate.name,
      rating: null,
      photo: candidate.photo,
      photoCredit: null,
      where: candidate.where,
      distance: candidate.distance,
      fact: candidate.fact,
      confidence: candidate.confidence ?? "confirmed",
    }));

  return {
    picks,
    href:
      daypartBrowseHref(row.category, row.label, scope) ||
      answer.browseHref ||
      row.href,
    contextLabel: answer.contextLabel || "Across Frederick County",
    contextSource: answer.contextSource ?? "county",
  };
}

export function daypartEmptyCopy(
  contextLabel: string,
  countywide: boolean,
): string {
  const scope =
    countywide
      ? "across Frederick County"
      : contextLabel === "Near you"
        ? "near you"
        : contextLabel.startsWith("Near ")
          ? `${contextLabel.charAt(0).toLocaleLowerCase()}${contextLabel.slice(1)}`
          : `in ${contextLabel}`;
  return `Nothing is confirmed open ${scope} right now.`;
}

/**
 * Only an explicit town scope filters the candidate set geographically.
 * Device, home, and IP origins rank the same countywide set; their labels must
 * not be turned into fake hard scopes such as "in Ranked from Brunswick."
 */
export function isDaypartCountywideContext(
  source: NonNullable<WantAnswer["contextSource"]>,
): boolean {
  return source !== "town";
}

/** The live ranker can honestly return no open places. Keep that answer in the
 * existing shelf instead of turning it into another full-size card. */
export function DaypartEmptyState({
  href = "/open-now",
  label = "Places open now",
  contextLabel = "Across Frederick County",
  countywide = true,
}: {
  href?: string;
  label?: string;
  contextLabel?: string;
  countywide?: boolean;
} = {}) {
  return (
    <section aria-label="Open places right now" className="mt-6">
      <TodaySectionHeading
        title={label}
        meta={contextLabel}
        href={href}
        cta={countywide ? "Browse places" : "Expand to county"}
      />
      <div
        role="status"
        className="rounded-[var(--app-radius-md)] border px-3 py-2.5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-hi)",
          color: "var(--app-ink-2)",
        }}
      >
        <p className="text-[12px] leading-snug">
          {daypartEmptyCopy(contextLabel, countywide)}
        </p>
      </div>
    </section>
  );
}

/**
 * The daypart's open-now place needs, shown as one focused shelf at a time.
 * The server still decides which categories and places qualify; this client
 * layer only lets the reader switch shelves without stacking several rails
 * down the page.
 */
export default function DaypartNeeds({
  rows,
  note,
}: {
  rows: DaypartRow[];
  note?: string | null;
}) {
  const [selectedCategory, setSelectedCategory] = useState(rows[0]?.category ?? "");
  const [liveShelves, setLiveShelves] = useState<Record<string, LiveShelf>>({});
  const [resolvedCategories, setResolvedCategories] = useState<Record<string, boolean>>({});
  const [contextRevision, setContextRevision] = useState(0);

  const baseActive = rows.find((row) => row.category === selectedCategory) ?? rows[0] ?? null;
  const activeCategory = baseActive?.category ?? "";
  const activeHref = baseActive?.href ?? "";
  const liveActive = baseActive ? liveShelves[baseActive.category] : undefined;
  const active = useMemo(
    () =>
      baseActive && liveActive
        ? { ...baseActive, picks: liveActive.picks, href: liveActive.href }
        : baseActive,
    [baseActive, liveActive],
  );
  const contextLabel = liveActive?.contextLabel ?? "Across Frederick County";
  const contextSource = liveActive?.contextSource ?? "county";
  const awaitingLive =
    Boolean(activeCategory) &&
    active?.picks.length === 0 &&
    !resolvedCategories[activeCategory];

  // The server renders useful cards immediately, then this shared decision
  // endpoint applies the user's real browsing context. It is the same ranking
  // path used by Today's "I want…" answers, so town scope, device location,
  // hours, chain penalties, and category matching cannot drift between the two
  // sections.
  useEffect(() => {
    if (!baseActive) return;
    let current = true;
    getWantAnswer(`cat:${baseActive.category}`, null)
      .then((raw) => {
        if (!current) return;
        const answer = raw as WantAnswer;
        const shelf = liveShelfFromWantAnswer(answer, baseActive, getScope());
        setLiveShelves((previous) => ({
          ...previous,
          [baseActive.category]: shelf,
        }));
      })
      .catch(() => {
        // Keep the already-rendered countywide shelf. A live refresh is an
        // enhancement, never a reason to replace useful content with an error.
      })
      .finally(() => {
        if (!current) return;
        setResolvedCategories((previous) => ({
          ...previous,
          [baseActive.category]: true,
        }));
      });
    return () => {
      current = false;
    };
  }, [activeCategory, activeHref, baseActive, contextRevision]);

  // A visitor can grant location from the header after this component mounts.
  // Same-tab storage changes are otherwise invisible, so listen to the
  // explicit location and scope signals and ask the shared ranker again.
  useEffect(() => {
    const refresh = () => {
      setLiveShelves({});
      setResolvedCategories({});
      setContextRevision((revision) => revision + 1);
    };
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, refresh);
    window.addEventListener(SCOPE_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener(GEOLOCATION_CHANGE_EVENT, refresh);
      window.removeEventListener(SCOPE_CHANGE_EVENT, refresh);
    };
  }, []);

  if (!active) return null;

  // Once the location-aware ranker has answered, a zero-result shelf should
  // not keep a heading, tab row, count line, and empty card in prime Today
  // space. Collapse it to one honest result plus a countywide escape hatch.
  if (!awaitingLive && active.picks.length === 0) {
    const countywide = isDaypartCountywideContext(contextSource);
    const countyHref =
      daypartBrowseHref(active.category, active.label, "county") || active.href;
    return (
      <DaypartEmptyState
        href={countywide ? active.href : countyHref}
        label="Places open now"
        contextLabel={contextLabel}
        countywide={countywide}
      />
    );
  }

  const likely = active.picks.length > 0 &&
    active.picks.every((place) => place.confidence === "likely");
  const countywide =
    contextLabel === "Across Frederick County" ||
    contextLabel === "Whole county";

  return (
    <section
      aria-label={likely ? "Places likely open right now" : "Open places right now"}
      className="mt-6"
    >
      <TodaySectionHeading
        title={likely ? "Places likely open" : "Places open now"}
        meta={contextLabel}
        href={active.href}
        cta="See all"
      />
      {note ? (
        <p className="-mt-1 px-0.5 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {note}
        </p>
      ) : null}

      {rows.length > 1 ? (
        <div
          role="tablist"
          aria-label="Open places by need"
          className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {rows.map((row) => {
            const selected = row.category === active.category;
            return (
              <button
                key={row.category}
                id={`daypart-tab-${row.category}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="daypart-active-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setSelectedCategory(row.category)}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const currentIndex = rows.findIndex((candidate) => candidate.category === active.category);
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? rows.length - 1
                        : event.key === "ArrowRight"
                          ? (currentIndex + 1) % rows.length
                          : (currentIndex - 1 + rows.length) % rows.length;
                  setSelectedCategory(rows[nextIndex].category);
                  const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  );
                  tabs?.[nextIndex]?.focus();
                }}
                className="tap-44 shrink-0 rounded-full border px-3 text-[12.5px] font-semibold transition active:scale-[0.98]"
                style={{
                  borderColor: selected ? "var(--app-brand)" : "var(--app-border)",
                  background: selected
                    ? "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated-solid))"
                    : "var(--app-bg-elevated)",
                  color: selected ? "var(--app-ink)" : "var(--app-ink-2)",
                }}
              >
                {row.label}
              </button>
            );
          })}
        </div>
      ) : (
        <h3 className="mt-3 text-[13px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
          {active.label}
        </h3>
      )}

      <div
        id="daypart-active-panel"
        role={rows.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={rows.length > 1 ? `daypart-tab-${active.category}` : undefined}
        className={rows.length > 1 ? "mt-2" : "mt-1"}
      >
        <div className="px-0.5">
          <p className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {awaitingLive
              ? "Checking nearby"
              : likely
                ? "Posted hours · check before going"
                : countywide
                  ? "Countywide picks"
                  : "Nearby picks"}
          </p>
        </div>

        {awaitingLive ? (
          <div
            className="mt-2 flex gap-2.5 overflow-hidden pb-1"
            aria-busy="true"
            aria-label={`Loading open ${active.label.toLocaleLowerCase()} places`}
          >
            {[0, 1, 2].map((slot) => (
              <Skeleton.Block
                key={slot}
                width="11.25rem"
                height="7.35rem"
                round="var(--app-radius-md)"
                className="shrink-0"
              />
            ))}
          </div>
        ) : active.picks.length > 0 ? (
          <ul className="shelf-rail mt-2 gap-2.5 pb-1">
            {active.picks.map((place) => (
              <li key={place.slug} className="shrink-0">
                <Link
                  href={`/places/${place.slug}`}
                  prefetch={false}
                  aria-label={`${place.name}, ${place.confidence === "likely" ? "likely open" : "open now"}`}
                  className="group relative flex h-[7.35rem] w-[11.25rem] flex-col justify-end overflow-hidden rounded-[var(--app-radius-md)] transition active:scale-[0.985]"
                  style={{ boxShadow: "var(--app-edge), var(--app-hi)" }}
                >
                  {place.photo ? (
                    <Image
                      src={place.photo}
                      alt=""
                      fill
                      unoptimized={place.photo.startsWith("/api/place-photo")}
                      sizes="168px"
                      placeholder="blur"
                      blurDataURL={PAPER_CREAM_BLUR}
                      className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.025]"
                    />
                  ) : (
                    <CategoryGraphic category={active.category} seed={place.slug} />
                  )}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
                    style={{
                      background:
                        "linear-gradient(to top, color-mix(in srgb, var(--app-ink) 84%, transparent), color-mix(in srgb, var(--app-ink) 36%, transparent) 46%, transparent)",
                    }}
                  />
                  <span className="relative z-10 min-w-0 px-2.5 pb-2">
                    <span
                      className="block truncate font-sans text-[14.5px] font-semibold leading-tight"
                      style={{ color: "var(--app-on-brand)" }}
                    >
                      {place.name}
                    </span>
                    <span
                      className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] tabular-nums"
                      style={{ color: "color-mix(in srgb, var(--app-on-brand) 86%, transparent)" }}
                    >
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background:
                            place.confidence === "likely"
                              ? "var(--app-warning)"
                              : "var(--app-positive)",
                        }}
                      />
                      {place.fact ||
                        (place.confidence === "likely" ? "Likely open" : "Open now")}
                      {place.distance ? <span>· {place.distance}</span> : null}
                      {!place.distance && place.where ? <span>· {place.where}</span> : null}
                      {!place.fact && place.rating ? <span>· {place.rating.toFixed(1)}★</span> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
