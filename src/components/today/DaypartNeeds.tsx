"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePlaceHue } from "@/components/place/PlaceCard";
import TodaySectionHeading from "@/components/today/TodaySectionHeading";
import SectionHeading from "@/components/ui/SectionHeading";
import { RadiusPhotoMark } from "@/components/ui/RadiusPhoto";
import type { DaypartPick, DaypartRow } from "@/lib/loaders/daypartPicks";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { getWantAnswer } from "@/lib/want-cache";
import { GEOLOCATION_CHANGE_EVENT } from "@/hooks/useGeolocation";
import { daypartBrowseHref } from "@/lib/today/daypart-needs";
import { getScope, parseScope, SCOPE_CHANGE_EVENT, type Scope } from "@/lib/scope";
import Skeleton from "@/components/ui/Skeleton";
import { persistOfflineTodaySnapshot } from "@/lib/offline-snapshot";
import { easternDayKey } from "@/lib/tz";
import { isLikelyOpenNow } from "@/data/reliable-open-windows";

type WantRow = {
  slug: string;
  name: string;
  photo: string | null;
  where: string | null;
  distance: string | null;
  fact: string;
  decisionReasons?: DaypartPick["decisionReasons"];
  confidence?: "confirmed" | "likely" | "unconfirmed";
};

type WantAnswer = {
  hero: WantRow | null;
  also: WantRow[];
  soon?: WantRow | null;
  browseHref: string;
  contextLabel: string;
  contextSource?: "town" | "device" | "home" | "ip" | "county" | "none";
  mayAssertNoneOpen?: boolean;
};

export type LiveShelf = {
  picks: DaypartPick[];
  openingSoon: DaypartPick | null;
  href: string;
  contextLabel: string;
  contextSource: NonNullable<WantAnswer["contextSource"]>;
  mayAssertNoneOpen: boolean;
};

export type DaypartNeedsVariant = "full" | "brief";

export function daypartUsablePickCount(
  shelf: {
    picks: readonly Pick<DaypartPick, "confidence">[];
    openingSoon?: DaypartPick | null;
  },
  variant: DaypartNeedsVariant = "full",
): number {
  const picks =
    variant === "brief"
      ? shelf.picks.filter((place) => place.confidence !== "unconfirmed")
      : shelf.picks;
  return picks.length + (shelf.openingSoon ? 1 : 0);
}

/**
 * Weather can add a useful but sparse category (for example museums on a wet
 * evening) ahead of the daypart's core need. Do not let that empty first row
 * become the whole shelf: start with the first category that already has a
 * trustworthy server result, while keeping every category available as a tab.
 */
export function initialDaypartCategory(
  rows: DaypartRow[],
  variant: DaypartNeedsVariant = "full",
): string {
  return (
    rows.find((row) => daypartUsablePickCount(row, variant) > 0)?.category ??
    rows[0]?.category ??
    ""
  );
}

/**
 * If a context-aware refresh removes the current shelf, keep checking the
 * other needs before settling on an empty answer. Prefer a row that already
 * has a server fallback so the handoff remains useful while its live result is
 * checked. Each category is visited at most once per location revision.
 */
export function nextUnresolvedDaypartCategory(
  rows: DaypartRow[],
  currentCategory: string,
  resolvedCategories: Record<string, boolean>,
  variant: DaypartNeedsVariant = "full",
): string | null {
  const unresolved = rows.filter(
    (row) =>
      row.category !== currentCategory &&
      resolvedCategories[row.category] !== true,
  );
  return (
    unresolved.find((row) => daypartUsablePickCount(row, variant) > 0)
      ?.category ??
    unresolved[0]?.category ??
    null
  );
}

/** The href mapping lives in lib/today/daypart-needs so the server HTML
 * emits the same availability-ordered destination this client refines.
 * Re-exported here because the client spec and callers reach it through this
 * component's surface. */
export { daypartBrowseHref };

/** Turn the live decision response into the shelf verbatim, including an empty
 * answer. A successful scoped zero is information; a rejected request, or a
 * countywide answer with weaker hours evidence than the painted shelf (see
 * keepsServerDaypartShelf), retains the countywide server fallback. */
const WANT_CONFIDENCE_RANK: Record<
  NonNullable<WantRow["confidence"]>,
  number
> = { confirmed: 0, likely: 1, unconfirmed: 2 };

export function liveShelfFromWantAnswer(
  answer: WantAnswer,
  row: DaypartRow,
  scope: Scope | null,
): LiveShelf {
  const toPick = (candidate: WantRow): DaypartPick => ({
    slug: candidate.slug,
    name: candidate.name,
    rating: null,
    photo: candidate.photo,
    photoCredit: null,
    where: candidate.where,
    distance: candidate.distance,
    fact: candidate.fact,
    decisionReasons: candidate.decisionReasons,
    confidence: candidate.confidence ?? "unconfirmed",
  });
  // `undefined` supports one rollout boundary: an older cached response did
  // not know this field, so retain the server-rendered transition. An explicit
  // null is a successful scoped answer and clears the countywide fallback.
  const openingSoon =
    answer.soon === undefined
      ? row.openingSoon ?? null
      : answer.soon
        ? toPick(answer.soon)
        : null;
  // Rows WITHOUT a confidence value are the ranker's notable lane: real,
  // quality-ranked places whose hours the county cannot currently vouch for.
  // Dropping them (the filter here used to require a confidence value) is what
  // turned a dark hours refresh into an empty shelf under the sentence
  // "Current hours do not confirm an open match" — five bakeries in hand, none
  // shown. Keep them and mark them unconfirmed; the tile prints their real
  // hours line and the heading stops claiming anything about open.
  const picks = [answer.hero, ...answer.also]
    .filter((candidate): candidate is WantRow => Boolean(candidate))
    .filter((candidate) => candidate.slug !== openingSoon?.slug)
    // Confidence outranks the ranker's order for the LEAD card specifically: a
    // place whose hours confirm it is open now must never sit behind one whose
    // hours are unknown. Sort is stable, so within a tier the ranker's order
    // survives, and it runs before the slice so a confirmed row deeper in the
    // also-list is not cut in favor of an unconfirmed hero.
    .sort(
      (a, b) => WANT_CONFIDENCE_RANK[a.confidence ?? "unconfirmed"]
        - WANT_CONFIDENCE_RANK[b.confidence ?? "unconfirmed"],
    )
    .slice(0, 4)
    .map(toPick);

  return {
    picks,
    openingSoon,
    href:
      daypartBrowseHref(row.category, row.label, scope) ||
      answer.browseHref ||
      row.href,
    contextLabel: answer.contextLabel || "Across Frederick County",
    contextSource: answer.contextSource ?? "county",
    mayAssertNoneOpen: answer.mayAssertNoneOpen === true,
  };
}

/** The strongest hours evidence on a shelf; lower is stronger. A shelf with no
 * picks has no evidence at all, so any shelf with a pick outranks it. */
export function daypartShelfConfidenceRank(
  picks: readonly Pick<DaypartPick, "confidence">[],
): number {
  return picks.reduce(
    (best, place) => Math.min(best, WANT_CONFIDENCE_RANK[place.confidence]),
    Number.POSITIVE_INFINITY,
  );
}

/**
 * Whether the server-rendered shelf should stay in place instead of the live
 * answer. The live refresh exists to apply the visitor's context, not to trade
 * stronger hours evidence for weaker evidence about the same countywide set:
 * on Oct 6 at 10:55 PM the cached shelf said "Hootch & Banter · Likely open"
 * and hydration swapped in a place whose hours were not confirmed at all.
 *
 * A town scope asks a narrower question, so its answer (even an empty one)
 * always replaces the countywide shelf. A live answer with enough hours
 * coverage to say nothing is open is current evidence, so it replaces the
 * shelf too. Cached HTML can also outlive what it printed: a likely pick only
 * counts while its curated window is open on this clock, and a confirmed pick
 * only until the closing time it states.
 */
export function keepsServerDaypartShelf(
  row: Pick<DaypartRow, "picks">,
  live: Pick<LiveShelf, "picks" | "contextSource" | "mayAssertNoneOpen">,
  now: Date,
): boolean {
  if (!isDaypartCountywideContext(live.contextSource)) return false;
  if (live.mayAssertNoneOpen) return false;
  return (
    daypartShelfConfidenceRank(live.picks) >
    daypartShelfConfidenceRank(currentServerDaypartPicks(row, now))
  );
}

const EASTERN_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function easternMinuteOfDay(now: Date): number {
  const parts = Object.fromEntries(
    EASTERN_CLOCK.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return (Number(parts.hour) % 24) * 60 + Number(parts.minute);
}

/** "Open until 10pm" or "Closing soon · 9:30pm" as minutes after midnight. */
function statedClosingMinute(fact: string | null | undefined): number | null {
  const match = fact
    ?.trim()
    .match(/^(?:Open until|Closing soon\s*·)\s+(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
  if (!match) return null;
  const hour = (Number(match[1]) % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  return hour * 60 + Number(match[2] ?? 0);
}

/** A cached confirmed pick is stale once this clock has reached the closing
 * time it printed. Only the half day after that time counts as past, so
 * "Open until 2am" read at 11pm is still ahead of its close. */
function confirmedPickStillOpen(place: DaypartPick, now: Date): boolean {
  const close = statedClosingMinute(place.fact);
  if (close == null) return true;
  const minutesSinceClose = (easternMinuteOfDay(now) - close + 1440) % 1440;
  return minutesSinceClose > 12 * 60;
}

function currentServerDaypartPicks(
  row: Pick<DaypartRow, "picks">,
  now: Date,
): DaypartPick[] {
  return row.picks.filter((place) =>
    place.confidence === "likely"
      ? isLikelyOpenNow(place.slug, now)
      : place.confidence === "confirmed"
        ? confirmedPickStillOpen(place, now)
        : true,
  );
}

/** The server shelf restated as the settled answer, without any pick whose
 * curated window or stated closing time has passed since the HTML rendered. */
export function serverDaypartShelf(row: DaypartRow, now: Date): LiveShelf {
  return {
    picks: currentServerDaypartPicks(row, now),
    openingSoon: row.openingSoon ?? null,
    href: row.href,
    contextLabel: "Across Frederick County",
    contextSource: "county",
    mayAssertNoneOpen: false,
  };
}

export function daypartEmptyCopy(
  contextLabel: string,
  countywide: boolean,
  mayReportNoneOpen: boolean,
  groupLabel = "this group",
): string {
  const scope =
    countywide
      ? "across Frederick County"
      : contextLabel === "Near you"
        ? "near you"
        : contextLabel.startsWith("Near ")
          ? `${contextLabel.charAt(0).toLocaleLowerCase()}${contextLabel.slice(1)}`
          : `in ${contextLabel}`;
  const group = groupLabel.trim().toLocaleLowerCase() || "this group";
  return mayReportNoneOpen
    ? `No open match for ${group} ${scope} right now.`
    : `Current hours do not confirm an open match for ${group} ${scope}.`;
}

/**
 * What the shelf may honestly claim about its picks as a group. The weakest
 * pick sets the ceiling: one unconfirmed row means the heading cannot say
 * "open now" about the shelf, and a shelf of only unconfirmed rows must not
 * promise open at all. "Places to try" is the honest heading for that case —
 * these are real, quality-ranked places; what is missing is the hours signal,
 * which each tile states for itself.
 */
export function daypartShelfTier(
  picks: readonly DaypartPick[],
): "confirmed" | "likely" | "unconfirmed" {
  if (picks.length === 0) return "confirmed";
  if (picks.every((place) => place.confidence === "unconfirmed")) return "unconfirmed";
  if (picks.every((place) => place.confidence !== "confirmed")) return "likely";
  return "confirmed";
}

export const DAYPART_SHELF_TITLE: Record<
  ReturnType<typeof daypartShelfTier>,
  string
> = {
  confirmed: "Places open now",
  likely: "Places likely open",
  unconfirmed: "Places to try",
};

export const DAYPART_SHELF_ARIA: Record<
  ReturnType<typeof daypartShelfTier>,
  string
> = {
  confirmed: "Open places right now",
  likely: "Places likely open right now",
  unconfirmed: "Places to try, hours not confirmed",
};

export function daypartShelfHeading(
  picks: readonly DaypartPick[],
  openingSoon: DaypartPick | null | undefined,
): { title: string; aria: string } {
  const tier = daypartShelfTier(picks);
  if (!openingSoon) {
    return {
      title: DAYPART_SHELF_TITLE[tier],
      aria: DAYPART_SHELF_ARIA[tier],
    };
  }
  if (picks.length === 0) {
    return { title: "Opening soon", aria: "Place opening soon" };
  }
  return tier === "confirmed"
    ? {
        title: "Open now and soon",
        aria: "Places open now and opening soon",
      }
    : {
        title: "Places for now and soon",
        aria: "Places for now and opening soon",
      };
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

/** The shelf's small scope line describes how its picks were ranked. An IP
 * estimate is not permission to say "nearby"; only an explicit device/home
 * origin gets that language. A town scope names the town, while the initial
 * server shelf and unscoped live answers stay plainly countywide. */
export function daypartPickScopeLabel(
  source: NonNullable<WantAnswer["contextSource"]>,
  contextLabel: string,
): string {
  if (source === "device" || source === "home") return "Nearby picks";
  if (source === "town") {
    const town = contextLabel.trim();
    return town ? `${town} picks` : "Town picks";
  }
  return "Countywide picks";
}

/** What the hours evidence lets a tile say about right now. A confirmed pick
 * quotes its current hours line; a likely pick says so and never prints a
 * closing time, because its window is a usual-hours statement, not a current
 * one; a pick without hours evidence says nothing about being open. */
function tileAvailability(place: DaypartPick): string | null {
  if (place.confidence === "likely") return "Likely open · check hours";
  if (place.confidence !== "confirmed") return null;
  const fact = place.fact?.trim() ?? "";
  if (/^(?:Open until\s+\S|Closing soon\b|Open 24 hours$)/i.test(fact)) {
    return fact;
  }
  // A confirmed pick is open by its current hours even when the server shelf
  // sent no hours line to quote.
  return "Open now";
}

/**
 * The one fact line under a shelf tile, from the same hours evidence the shelf
 * heading uses. The availability leads. A consented device fix adds the walk
 * or distance; a countywide shelf adds the town instead, because the same
 * heading can hold a Frederick bar and a Thurmont one. A pick with no hours
 * evidence shows only its town, never curation or review history: "a local
 * favorite" under a bar whose hours were not confirmed read as a reason to go
 * (Today, Oct 6, 10:55 PM).
 */
export function daypartTileFact(
  place: DaypartPick,
  contextSource: NonNullable<WantAnswer["contextSource"]> = "county",
  { openingSoon = false }: { openingSoon?: boolean } = {},
): string | null {
  const town = place.where?.trim() || null;
  // An opening-soon tile states only its own opening time, so a closed place
  // never borrows the shelf's open grammar before the opening minute.
  const availability = openingSoon
    ? place.fact?.trim() || "Opening time available"
    : tileAvailability(place);
  if (!availability) return town;
  const distance =
    contextSource === "device" ? place.distance?.trim() || null : null;
  const where = distance ?? (contextSource === "town" ? null : town);
  return where ? `${availability} · ${where}` : availability;
}

/** Ask the photo proxy for its 1x1 failure signal. This shelf replaces a
 * failed photograph with the place's flat category mark, so it should never
 * render the proxy's large decorative placeholder as content. */
export function daypartPhotoSrc(src: string): string {
  if (!src.startsWith("/api/place-photo")) return src;
  const url = new URL(src, "https://frederickradius.local");
  url.searchParams.set("fallback", "signal");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function isPhotoFailureSignal(image: {
  naturalWidth: number;
  naturalHeight: number;
}): boolean {
  return image.naturalWidth === 1 && image.naturalHeight === 1;
}

/** The live ranker can honestly return no open places. Keep that answer in the
 * existing shelf instead of turning it into another full-size card. */
export function DaypartEmptyState({
  href = "/open-now",
  label = "Places open now",
  contextLabel = "Across Frederick County",
  countywide = true,
  mayReportNoneOpen = false,
  groupLabel = "this group",
}: {
  href?: string;
  label?: string;
  contextLabel?: string;
  countywide?: boolean;
  mayReportNoneOpen?: boolean;
  groupLabel?: string;
} = {}) {
  return (
    <section aria-label="Open places right now">
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
        <p className="text-meta">
          {daypartEmptyCopy(
            contextLabel,
            countywide,
            mayReportNoneOpen,
            groupLabel,
          )}
        </p>
      </div>
    </section>
  );
}

/** Frame heights: a lone tile gets the larger picture. */
const TILE_FRAME = { pair: 104, single: 140 } as const;
/** Painted widths for the proxy request (it doubles them for DPR). */
const TILE_PAINT_WIDTH = { pair: 200, single: 400 } as const;

/**
 * One shelf answer as a picture tile: a real photo that actually loaded, or
 * the place's flat category mark on its own hue, then its name and one fact.
 * The whole tile is one link. Never initials, a gradient, or a map canvas
 * here, so Today's first paint mounts no WebGL.
 *
 * An opening-soon tile keeps its own data attributes and prints only its
 * opening fact, so a closed place never borrows the shelf's open grammar.
 */
function DaypartTile({
  place,
  category,
  single,
  eager = false,
  lead = false,
  openingSoon = false,
  contextSource,
}: {
  place: DaypartPick;
  category: string;
  single: boolean;
  eager?: boolean;
  lead?: boolean;
  openingSoon?: boolean;
  contextSource: NonNullable<WantAnswer["contextSource"]>;
}) {
  const shape = single ? "single" : "pair";
  // Narrow the proxy request to what the frame paints. The stored URL is the
  // w=800 hero and these render `unoptimized` (the proxy is an opaque route
  // Next cannot resize), so the request width is the only size control.
  // Narrowing composes with the failure signal: the proxy returns its 1x1 at
  // every width, so the honest broken-photo path is unchanged.
  const signaledPhoto = place.photo
    ? daypartPhotoSrc(proxyPhotoAtWidth(place.photo, TILE_PAINT_WIDTH[shape]))
    : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(signaledPhoto && failedSrc !== signaledPhoto);
  const hue = usePlaceHue(place.slug);
  const frameHeight = TILE_FRAME[shape];
  const fact = daypartTileFact(place, contextSource, { openingSoon });

  return (
    <Link
      href={`/places/${place.slug}`}
      prefetch={false}
      data-today-place-lead={lead ? "true" : undefined}
      data-today-opening-soon={openingSoon ? "true" : undefined}
      data-place-availability={openingSoon ? "opening-soon" : undefined}
      data-today-tile={shape}
      data-decision-impression="true"
      data-decision-surface="today"
      data-decision-entity="place"
      data-decision-id={place.slug}
      data-decision-position={
        openingSoon ? "opening-soon" : lead ? "lead" : "alternative"
      }
      data-decision-action="open"
      className="group flex min-w-0 flex-col gap-2 rounded-[var(--app-radius-md)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--app-bg)]"
    >
      <span
        data-today-tile-frame
        className="relative block w-full overflow-hidden rounded-[var(--app-radius-md)]"
        style={{ height: frameHeight, background: "var(--app-bg-sunken)" }}
      >
        {showPhoto && signaledPhoto ? (
          <Image
            src={signaledPhoto}
            alt=""
            fill
            sizes={
              single
                ? "(min-width: 640px) 400px, calc(100vw - 32px)"
                : "(min-width: 640px) 200px, calc(50vw - 22px)"
            }
            unoptimized={signaledPhoto.startsWith("/api/place-photo")}
            priority={eager}
            fetchPriority={eager ? "high" : "auto"}
            placeholder="blur"
            blurDataURL={PAPER_CREAM_BLUR}
            className="object-cover"
            onLoad={(event) => {
              if (isPhotoFailureSignal(event.currentTarget)) {
                setFailedSrc(signaledPhoto);
              }
            }}
            onError={() => setFailedSrc(signaledPhoto)}
          />
        ) : (
          <RadiusPhotoMark
            category={category}
            hue={hue}
            size={72}
            height={frameHeight}
            style={{ width: "100%" }}
          />
        )}
      </span>
      <span className="block min-w-0 px-0.5">
        <span
          data-today-pick-name
          className="text-title-sm line-clamp-2 decoration-1 underline-offset-2 group-hover:underline"
          style={{ color: "var(--app-ink)" }}
        >
          {place.name}
        </span>
        {fact ? (
          <span
            data-today-pick-context
            className="text-meta-lg mt-0.5 line-clamp-2 tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {fact}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** Loading tiles in the loaded shape, so the answer lands without a jump. */
function DaypartTileSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <Skeleton.Block
        width="100%"
        height={TILE_FRAME.pair}
        round="var(--app-radius-md)"
      />
      <Skeleton.Block width="80%" height={16} round="var(--app-radius-sm)" />
      <Skeleton.Block width="60%" height={13} round="var(--app-radius-sm)" />
    </div>
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
  variant = "full",
}: {
  rows: DaypartRow[];
  note?: string | null;
  variant?: DaypartNeedsVariant;
}) {
  const [selectedCategory, setSelectedCategory] = useState(() =>
    initialDaypartCategory(rows, variant),
  );
  const [liveShelves, setLiveShelves] = useState<Record<string, LiveShelf>>({});
  const [resolvedCategories, setResolvedCategories] = useState<Record<string, boolean>>({});
  const [contextRevision, setContextRevision] = useState(0);
  const resolvedCategoriesRef = useRef<Record<string, boolean>>({});
  const mayAutoAdvanceRef = useRef(true);

  const baseActive = rows.find((row) => row.category === selectedCategory) ?? rows[0] ?? null;
  const activeCategory = baseActive?.category ?? "";
  const activeHref = baseActive?.href ?? "";
  const liveActive = baseActive ? liveShelves[baseActive.category] : undefined;
  const active = useMemo(
    () =>
      baseActive && liveActive
        ? {
            ...baseActive,
            picks: liveActive.picks,
            openingSoon: liveActive.openingSoon,
            href: liveActive.href,
          }
        : baseActive,
    [baseActive, liveActive],
  );
  const contextLabel = liveActive?.contextLabel ?? "Across Frederick County";
  const contextSource = liveActive?.contextSource ?? "county";
  const awaitingLive =
    Boolean(activeCategory) &&
    active?.picks.length === 0 &&
    !active?.openingSoon &&
    !resolvedCategories[activeCategory];

  // The server renders useful cards immediately, then this shared decision
  // endpoint applies the user's real browsing context. It is the same ranking
  // path used by Today's "I want…" answers, so town scope, device location,
  // hours, chain penalties, and category matching cannot drift between the two
  // sections.
  useEffect(() => {
    if (!baseActive) return;
    let current = true;
    const settleCategory = (pickCount: number) => {
      const resolvedAfter = {
        ...resolvedCategoriesRef.current,
        [baseActive.category]: true,
      };
      resolvedCategoriesRef.current = resolvedAfter;
      setResolvedCategories(resolvedAfter);
      if (pickCount !== 0 || !mayAutoAdvanceRef.current) return;
      const next = nextUnresolvedDaypartCategory(
        rows,
        baseActive.category,
        resolvedAfter,
        variant,
      );
      if (next) setSelectedCategory(next);
    };
    // Today labels an unset lens as the whole county. Send that default
    // explicitly so the API cannot substitute a home/IP origin or old cookie.
    // Capture one scope for both the request and its eventual browse link.
    const scope = parseScope(new URLSearchParams(window.location.search).get("in"))
      ?? getScope() ?? "county";
    getWantAnswer(`cat:${baseActive.category}`, null, scope)
      .then((raw) => {
        if (!current) return;
        const answer = raw as WantAnswer;
        const live = liveShelfFromWantAnswer(answer, baseActive, scope);
        // Never trade the painted shelf for weaker hours evidence about the
        // same countywide set. This also holds during auto-advance, where the
        // next category's server shelf is what the reader is about to see.
        const now = new Date();
        const shelf = keepsServerDaypartShelf(baseActive, live, now)
          ? serverDaypartShelf(baseActive, now)
          : live;
        setLiveShelves((previous) => ({
          ...previous,
          [baseActive.category]: shelf,
        }));
        settleCategory(daypartUsablePickCount(shelf, variant));
      })
      .catch(() => {
        if (!current) return;
        // Keep the already-rendered countywide shelf. A live refresh is an
        // enhancement, never a reason to replace useful content with an error.
        settleCategory(daypartUsablePickCount(baseActive, variant));
      });
    return () => {
      current = false;
    };
  }, [activeCategory, activeHref, baseActive, contextRevision, rows, variant]);

  // A visitor can grant location from the header after this component mounts.
  // Same-tab storage changes are otherwise invisible, so listen to the
  // explicit location and scope signals and ask the shared ranker again.
  useEffect(() => {
    const refresh = () => {
      setLiveShelves({});
      setResolvedCategories({});
      resolvedCategoriesRef.current = {};
      setSelectedCategory(initialDaypartCategory(rows, variant));
      mayAutoAdvanceRef.current = true;
      setContextRevision((revision) => revision + 1);
    };
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, refresh);
    window.addEventListener(SCOPE_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener(GEOLOCATION_CHANGE_EVENT, refresh);
      window.removeEventListener(SCOPE_CHANGE_EVENT, refresh);
    };
  }, [rows, variant]);

  // Keep one public, actionable place as the offline Today handoff. This never
  // stores the user's coordinates or distance; the offline page labels the
  // entire read as a saved, potentially changed snapshot.
  useEffect(() => {
    if (navigator.onLine === false) return;
    const first = active?.picks[0] ?? active?.openingSoon;
    if (!first) return;
    void persistOfflineTodaySnapshot({
      dayKey: easternDayKey(new Date()),
      lead: {
        kind: "place",
        title: first.name,
        detail: first.fact || first.where || undefined,
        href: `/places/${first.slug}`,
      },
    }).catch(() => {});
  }, [active]);

  if (!active) return null;

  // A single-category shelf can collapse to one compact answer. A
  // multi-category shelf must keep its tabs: an empty museum (or coffee) query
  // says nothing about dinner, breweries, or the other needs beside it.
  if (
    !awaitingLive &&
    active.picks.length === 0 &&
    !active.openingSoon &&
    rows.length === 1
  ) {
    const countywide = isDaypartCountywideContext(contextSource);
    const countyHref =
      daypartBrowseHref(active.category, active.label, "county") || active.href;
    return (
      <DaypartEmptyState
        href={countywide ? active.href : countyHref}
        label="Places open now"
        contextLabel={contextLabel}
        countywide={countywide}
        mayReportNoneOpen={liveActive?.mayAssertNoneOpen === true}
        groupLabel={active.label}
      />
    );
  }

  const shelfTier = daypartShelfTier(active.picks);
  const pickScopeLabel = daypartPickScopeLabel(contextSource, contextLabel);
  const openingSoonFirst =
    Boolean(active.openingSoon) && shelfTier !== "confirmed";
  // Prefer a current-hours answer. When hours are unavailable everywhere,
  // keep one real option and let the unconfirmed heading explain its limit.
  const knownPicks = active.picks.filter((place) => place.confidence !== "unconfirmed");
  const decisionPicks = variant === "brief" && knownPicks.length > 0 ? knownPicks : active.picks;
  const briefUsesOpeningSoon =
    variant === "brief" &&
    Boolean(active.openingSoon) &&
    (openingSoonFirst || decisionPicks.length === 0);
  // Today's briefing shows two picture answers above the nav, or the
  // opening-soon transition in their place when it is the more useful answer.
  // The full shelf keeps a three-choice decision set for comparison contexts,
  // where an opening-soon transition consumes the third slot.
  const visiblePicks = decisionPicks.slice(
    0,
    variant === "brief"
      ? briefUsesOpeningSoon
        ? 0
        : 2
      : active.openingSoon
        ? 2
        : 3,
  );
  const soon =
    active.openingSoon && (variant === "full" || briefUsesOpeningSoon)
      ? active.openingSoon
      : null;
  // The heading describes what is actually visible. A brief answer may know
  // about both current places and an opening-soon transition, but it presents
  // only the stronger of the two rather than promising both in its label.
  const shelfHeading = daypartShelfHeading(visiblePicks, soon);
  const tiles: { place: DaypartPick; openingSoon: boolean }[] = [
    ...(soon && openingSoonFirst ? [{ place: soon, openingSoon: true }] : []),
    ...visiblePicks.map((place) => ({ place, openingSoon: false })),
    ...(soon && !openingSoonFirst ? [{ place: soon, openingSoon: true }] : []),
  ];
  const showCategoryTabs = variant === "full" && rows.length > 1;
  const visibleTier = daypartShelfTier(visiblePicks);
  // Each likely tile already says "check hours". Tiles without hours evidence
  // show only their town, so the shelf says once that the hours are unknown.
  // The full shelf keeps its ranking line for comparison contexts.
  const shelfCaveat = awaitingLive
    ? "Checking nearby"
    : visiblePicks.length === 0
      ? null
      : visibleTier === "unconfirmed"
        ? variant === "brief"
          ? "Hours not confirmed · call ahead"
          : `${pickScopeLabel} · Hours not confirmed; call ahead`
        : variant === "full" && visibleTier === "likely"
          ? `${pickScopeLabel} · Posted hours; check before going`
          : null;

  return (
    <section
      aria-label={shelfHeading.aria}
      data-today-decision-density={variant}
    >
      <SectionHeading
        title={shelfHeading.title}
        href={variant === "brief" ? "/open-now" : active.href}
        cta="See all"
      />
      {note ? (
        <p className="text-meta-lg mt-1 px-0.5" style={{ color: "var(--app-ink-2)" }}>
          {note}
        </p>
      ) : null}

      {showCategoryTabs ? (
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
                onClick={() => {
                  mayAutoAdvanceRef.current = false;
                  setSelectedCategory(row.category);
                }}
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
                  mayAutoAdvanceRef.current = false;
                  setSelectedCategory(rows[nextIndex].category);
                  const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  );
                  tabs?.[nextIndex]?.focus();
                }}
                className="tap-44 text-meta-lg min-h-11 shrink-0 rounded-full border px-3 font-semibold transition active:scale-[0.98]"
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
      ) : variant === "full" ? (
        <h3 className="text-meta-lg mt-3 font-semibold" style={{ color: "var(--app-ink-2)" }}>
          {active.label}
        </h3>
      ) : null}

      <div
        key={active.category}
        id="daypart-active-panel"
        role={showCategoryTabs ? "tabpanel" : undefined}
        aria-labelledby={showCategoryTabs ? `daypart-tab-${active.category}` : undefined}
        className="mt-2 today-decision-swap"
      >
        {shelfCaveat ? (
          <p className="text-meta-lg px-0.5" style={{ color: "var(--app-ink-3)" }}>
            {shelfCaveat}
          </p>
        ) : null}

        {awaitingLive ? (
          <div
            className="mt-2 grid grid-cols-2 gap-3"
            aria-busy="true"
            aria-label={`Loading open ${active.label.toLocaleLowerCase()} places`}
          >
            <DaypartTileSkeleton />
            <DaypartTileSkeleton />
          </div>
        ) : tiles.length > 0 ? (
          // Two tiles share a row. An odd count lets the first tile span the
          // row with the larger picture, so no tile is stranded at half width.
          <ul className="mt-2 grid grid-cols-2 gap-3">
            {tiles.map(({ place, openingSoon }, index) => {
              const single = index === 0 && tiles.length % 2 === 1;
              return (
                <li
                  key={`${openingSoon ? "soon" : "pick"}-${place.slug}`}
                  className={`min-w-0 ${single ? "col-span-2" : ""}`}
                >
                  <DaypartTile
                    place={place}
                    category={active.category}
                    single={single}
                    eager={index === 0}
                    lead={!openingSoon && place.slug === visiblePicks[0]?.slug}
                    openingSoon={openingSoon}
                    contextSource={contextSource}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div
            role="status"
            className="mt-2 flex min-h-11 items-center justify-between gap-3"
          >
            <p className="text-meta-lg px-0.5" style={{ color: "var(--app-ink-2)" }}>
              {daypartEmptyCopy(
                contextLabel,
                isDaypartCountywideContext(contextSource),
                liveActive?.mayAssertNoneOpen === true,
                active.label,
              )}
            </p>
            {variant === "full" ? (
              <Link
                href={active.href}
                prefetch={false}
                className="tap-44 text-meta-lg shrink-0 font-semibold underline decoration-1 underline-offset-4"
                style={{ color: "var(--app-brand-press)" }}
              >
                Browse
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
