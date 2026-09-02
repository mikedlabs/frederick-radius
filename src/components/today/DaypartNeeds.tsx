"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import CategoryIcon from "@/components/place/CategoryIcon";
import TodaySectionHeading from "@/components/today/TodaySectionHeading";
import type { DaypartPick, DaypartRow } from "@/lib/loaders/daypartPicks";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { getWantAnswer } from "@/lib/want-cache";
import { GEOLOCATION_CHANGE_EVENT } from "@/hooks/useGeolocation";
import { daypartBrowseHref } from "@/lib/today/daypart-needs";
import { getScope, SCOPE_CHANGE_EVENT, type Scope } from "@/lib/scope";
import Skeleton from "@/components/ui/Skeleton";
import { persistOfflineTodaySnapshot } from "@/lib/offline-snapshot";
import { easternDayKey } from "@/lib/tz";

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

/**
 * Weather can add a useful but sparse category (for example museums on a wet
 * evening) ahead of the daypart's core need. Do not let that empty first row
 * become the whole shelf: start with the first category that already has a
 * trustworthy server result, while keeping every category available as a tab.
 */
export function initialDaypartCategory(rows: DaypartRow[]): string {
  return (
    rows.find((row) => row.picks.length > 0 || Boolean(row.openingSoon))
      ?.category ?? rows[0]?.category ?? ""
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
): string | null {
  const unresolved = rows.filter(
    (row) =>
      row.category !== currentCategory &&
      resolvedCategories[row.category] !== true,
  );
  return (
    unresolved.find(
      (row) => row.picks.length > 0 || Boolean(row.openingSoon),
    )?.category ??
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
 * answer. A successful scoped zero is information; only a rejected request may
 * retain the countywide server fallback. */
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

function leadAvailabilityClause(place: DaypartPick): string | null {
  if (place.confidence !== "confirmed") return null;
  const fact = place.fact?.trim();
  if (!fact) return null;
  const until = fact.match(/^Open until\s+(.+)$/i);
  if (until) return `It is open until ${until[1]}`;
  const closing = fact.match(/^Closing soon\s*[·-]\s*(.+)$/i);
  if (closing) return `It closes soon at ${closing[1]}`;
  if (/^Open 24 hours$/i.test(fact)) return "It is open 24 hours";
  if (/^Open now$/i.test(fact)) return "Current hours show it is open now";
  return null;
}

function leadDistanceClause(distance: string | null | undefined): string | null {
  const value = distance?.trim();
  if (!value) return null;
  const walk = value.match(/^(\d+)\s+min walk$/i);
  if (walk) return `a ${walk[1]}-minute walk from you`;
  const miles = value.match(/^([\d.]+)\s+mi$/i);
  if (miles) return `${miles[1]} ${miles[1] === "1" ? "mile" : "miles"} from you`;
  const feet = value.match(/^(\d+)\s+ft$/i);
  if (feet) return `${feet[1]} feet from you`;
  return `${value} from you`;
}

/** Explain the lead with the evidence a person can act on first. Exact current
 * hours and consented-device distance beat popularity or review-volume
 * signals; editorial and third-party evidence remain useful tie-breakers when
 * the live answer cannot state either one. */
export function daypartLeadReason(
  picks: readonly DaypartPick[],
): string | null {
  const lead = picks[0];
  if (!lead) return null;
  const availability = leadAvailabilityClause(lead);
  const distance = leadDistanceClause(lead.distance);
  if (availability && distance) return `${availability} and is ${distance}.`;
  if (availability) return `${availability}.`;
  if (distance) return `It is ${distance}.`;

  const reasons = lead.decisionReasons ?? [];
  const priority = [
    "availability",
    "proximity",
    "intent-fit",
    "local-favorite",
    "hidden-gem",
    "review-evidence",
  ];
  for (const id of priority) {
    const reason = reasons.find((candidate) => candidate.id === id);
    if (reason) return reason.label;
  }
  return reasons[0]?.label ?? null;
}

/** Ask the photo proxy for its 1x1 failure signal. This particular shelf can
 * replace a failed photograph with a much better compact category card, so it
 * should never render the proxy's large decorative placeholder as content. */
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

function DaypartPickCard({
  place,
  category,
  eager = false,
  lead = false,
}: {
  place: DaypartPick;
  category: string;
  eager?: boolean;
  lead?: boolean;
}) {
  // Narrow the proxy request to what the card actually paints (lead 232px,
  // alternates 172px; proxyPhotoAtWidth doubles for DPR). The stored URL is
  // the w=800 hero, and because these render `unoptimized` (the proxy is an
  // opaque route Next cannot resize) the `sizes` hint is inert — so every
  // /today visit was downloading ~247KB per lead and ~104KB per alternate,
  // re-paid on each visit since /api/place-photo is deliberately no-store
  // (a Google licensing constraint). Measured by the friction audit: 819KB
  // saved across the shelf's double paint. Narrowing composes with the
  // failure signal below: the proxy returns its 1x1 at every width, so the
  // honest broken-photo path is unchanged. Same missed-adopter fix as
  // PlaceCard's Thumb (commit 31c91814 created the helper for this bug).
  const signaledPhoto = place.photo
    ? daypartPhotoSrc(proxyPhotoAtWidth(place.photo, lead ? 232 : 172))
    : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(signaledPhoto && failedSrc !== signaledPhoto);
  const detail =
    place.fact ||
    (place.confidence === "confirmed"
      ? "Open now"
      : place.confidence === "likely"
        ? "Likely open"
        : "Hours not confirmed");
  const placeContext = place.distance
    ? ` · ${place.distance}`
    : place.where
      ? ` · ${place.where}`
      : "";

  if (showPhoto && signaledPhoto) {
    return (
      <Link
        href={`/places/${place.slug}`}
        prefetch={false}
        data-today-place-lead={lead ? "true" : undefined}
        data-decision-impression="true"
        data-decision-surface="today"
        data-decision-entity="place"
        data-decision-id={place.slug}
        data-decision-position={lead ? "lead" : "alternative"}
        data-decision-action="open"
        className={`group relative flex h-[7.35rem] flex-col justify-end overflow-hidden rounded-[var(--app-radius-md)] transition active:scale-[0.985] ${
          lead ? "w-full sm:w-[14.5rem] lg:w-[17.5rem]" : "w-full sm:w-[10.75rem] lg:w-[13.5rem]"
        }`}
        style={{ boxShadow: "var(--app-edge), var(--app-hi)" }}
      >
        <Image
          src={signaledPhoto}
          alt=""
          fill
          unoptimized={signaledPhoto.startsWith("/api/place-photo")}
          priority={eager}
          fetchPriority={eager ? "high" : "auto"}
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.025]"
          onLoad={(event) => {
            if (isPhotoFailureSignal(event.currentTarget)) {
              setFailedSrc(signaledPhoto);
            }
          }}
          onError={() => setFailedSrc(signaledPhoto)}
        />
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
            className="line-clamp-2 font-sans text-[14.5px] font-semibold leading-tight"
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
                  place.confidence === "confirmed"
                    ? "var(--app-positive)"
                    : place.confidence === "likely"
                      ? "var(--app-warning)"
                      : "var(--app-ink-3)",
              }}
            />
            {detail}
            {place.distance ? <span>· {place.distance}</span> : null}
            {!place.distance && place.where ? <span>· {place.where}</span> : null}
            {!place.fact && place.rating ? <span>· {place.rating.toFixed(1)}★</span> : null}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/places/${place.slug}`}
      prefetch={false}
      data-today-place-lead={lead ? "true" : undefined}
      data-decision-impression="true"
      data-decision-surface="today"
      data-decision-entity="place"
      data-decision-id={place.slug}
      data-decision-position={lead ? "lead" : "alternative"}
      data-decision-action="open"
      className={`group relative flex h-full min-h-[84px] items-center gap-2.5 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-2.5 py-2.5 transition active:scale-[0.985] ${
        lead ? "w-full sm:w-[14.5rem] lg:w-[17.5rem]" : "w-full sm:w-[10.75rem] lg:w-[13.5rem]"
      }`}
      style={{
        borderColor: "var(--app-border)",
        boxShadow: "var(--app-edge), var(--app-hi)",
        background: lead
          ? "linear-gradient(118deg, color-mix(in srgb, var(--app-brand) 8%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid) 68%)"
          : "var(--app-bg-elevated)",
      }}
    >
      {lead ? (
        <CategoryIcon
          slug={category}
          aria-hidden
          className="pointer-events-none absolute -right-2 -top-2 h-[74px] w-[74px] rotate-[-7deg] opacity-[0.055] transition-transform duration-300 motion-safe:group-hover:rotate-0 motion-safe:group-hover:scale-[1.03]"
          strokeWidth={1.35}
        />
      ) : null}
      <span
        aria-hidden
        className={`relative z-10 grid shrink-0 place-items-center rounded-[var(--app-radius-sm)] ${lead ? "h-11 w-11" : "h-9 w-9"}`}
        style={{
          color: "var(--app-brand-press)",
          background: "var(--app-brand-tint-6)",
        }}
      >
        <CategoryIcon slug={category} className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </span>
      <span className="relative z-10 min-w-0 flex-1">
        <span
          className="line-clamp-3 text-[14px] font-semibold leading-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {place.name}
        </span>
        <span
          className="mt-1 block truncate text-[11.5px]"
          style={{ color: "var(--app-ink-2)" }}
        >
          {detail}
          {placeContext}
        </span>
      </span>
    </Link>
  );
}

/** A closed door with a useful near-term transition. It is deliberately not a
 * DaypartPickCard: the separate treatment prevents a confirmed schedule from
 * borrowing the shelf's "open now" grammar before the opening minute. */
function OpeningSoonPick({
  place,
  category,
}: {
  place: DaypartPick;
  category: string;
}) {
  const signaledPhoto = place.photo
    ? daypartPhotoSrc(proxyPhotoAtWidth(place.photo, 192))
    : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(signaledPhoto && failedSrc !== signaledPhoto);
  const context = place.distance || place.where;

  return (
    <Link
      href={`/places/${place.slug}`}
      prefetch={false}
      data-today-opening-soon="true"
      data-place-availability="opening-soon"
      data-decision-impression="true"
      data-decision-surface="today"
      data-decision-entity="place"
      data-decision-id={place.slug}
      data-decision-position="opening-soon"
      data-decision-action="open"
      className="group mt-2 flex min-h-[84px] w-full overflow-hidden rounded-[var(--app-radius-md)] border transition active:scale-[0.985]"
      style={{
        borderColor:
          "color-mix(in srgb, var(--app-amber) 42%, var(--app-border))",
        background:
          "linear-gradient(112deg, color-mix(in srgb, var(--app-amber) 11%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid) 64%)",
        boxShadow: "var(--app-edge), var(--app-hi)",
      }}
    >
      {showPhoto && signaledPhoto ? (
        <span className="relative min-h-[84px] w-[5.75rem] shrink-0 overflow-hidden">
          <Image
            src={signaledPhoto}
            alt=""
            fill
            unoptimized={signaledPhoto.startsWith("/api/place-photo")}
            placeholder="blur"
            blurDataURL={PAPER_CREAM_BLUR}
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.025]"
            onLoad={(event) => {
              if (isPhotoFailureSignal(event.currentTarget)) {
                setFailedSrc(signaledPhoto);
              }
            }}
            onError={() => setFailedSrc(signaledPhoto)}
          />
        </span>
      ) : (
        <span
          aria-hidden
          className="m-3 grid h-11 w-11 shrink-0 place-items-center self-center rounded-[var(--app-radius-sm)]"
          style={{
            color: "var(--app-warning-press)",
            background: "var(--app-warning-tint-14)",
          }}
        >
          <CategoryIcon slug={category} className="h-5 w-5" strokeWidth={1.9} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5">
        <span
          className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.11em]"
          style={{ color: "var(--app-warning-press)" }}
        >
          Opening soon
        </span>
        <span
          className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {place.name}
        </span>
        <span
          className="mt-1 text-[11.5px] leading-snug"
          style={{ color: "var(--app-ink-2)" }}
        >
          {place.fact || "Opening time available"}
          {context ? <span> · {context}</span> : null}
        </span>
      </span>
    </Link>
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
  const [selectedCategory, setSelectedCategory] = useState(() =>
    initialDaypartCategory(rows),
  );
  const [liveShelves, setLiveShelves] = useState<Record<string, LiveShelf>>({});
  const [resolvedCategories, setResolvedCategories] = useState<Record<string, boolean>>({});
  const [contextRevision, setContextRevision] = useState(0);
  const resolvedCategoriesRef = useRef<Record<string, boolean>>({});
  const mayAutoAdvanceRef = useRef(true);
  const shelfRef = useRef<HTMLUListElement>(null);

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
  const activePickKey = active
    ? [
        ...active.picks.map((place) => place.slug),
        active.openingSoon?.slug ?? "",
      ].join("|")
    : "";

  // A town/location refresh replaces this ranked shelf in place. Browsers can
  // preserve the old horizontal offset as that list changes, which made the
  // new first (and therefore best) answer arrive half off-screen. A new shelf
  // always begins with its first result; ordinary user scrolling is untouched
  // because this only runs when the category or result identities change.
  useEffect(() => {
    shelfRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [activeCategory, activePickKey]);

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
      );
      if (next) setSelectedCategory(next);
    };
    getWantAnswer(`cat:${baseActive.category}`, null)
      .then((raw) => {
        if (!current) return;
        const answer = raw as WantAnswer;
        const shelf = liveShelfFromWantAnswer(answer, baseActive, getScope());
        setLiveShelves((previous) => ({
          ...previous,
          [baseActive.category]: shelf,
        }));
        settleCategory(
          shelf.picks.length + (shelf.openingSoon ? 1 : 0),
        );
      })
      .catch(() => {
        if (!current) return;
        // Keep the already-rendered countywide shelf. A live refresh is an
        // enhancement, never a reason to replace useful content with an error.
        settleCategory(
          baseActive.picks.length + (baseActive.openingSoon ? 1 : 0),
        );
      });
    return () => {
      current = false;
    };
  }, [activeCategory, activeHref, baseActive, contextRevision, rows]);

  // A visitor can grant location from the header after this component mounts.
  // Same-tab storage changes are otherwise invisible, so listen to the
  // explicit location and scope signals and ask the shared ranker again.
  useEffect(() => {
    const refresh = () => {
      setLiveShelves({});
      setResolvedCategories({});
      resolvedCategoriesRef.current = {};
      setSelectedCategory(initialDaypartCategory(rows));
      mayAutoAdvanceRef.current = true;
      setContextRevision((revision) => revision + 1);
    };
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, refresh);
    window.addEventListener(SCOPE_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener(GEOLOCATION_CHANGE_EVENT, refresh);
      window.removeEventListener(SCOPE_CHANGE_EVENT, refresh);
    };
  }, [rows]);

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
  const shelfHeading = daypartShelfHeading(
    active.picks,
    active.openingSoon,
  );
  const pickScopeLabel = daypartPickScopeLabel(contextSource, contextLabel);
  // Today edits the answer to one lead and two alternatives. The deeper route
  // remains in See all; a fourth card created a second mobile row that pushed
  // the universal Find doorway well below the first viewport.
  const visiblePicks = active.picks.slice(0, active.openingSoon ? 2 : 3);
  const openingSoonFirst =
    Boolean(active.openingSoon) && shelfTier !== "confirmed";
  // When the transition leads visually, a reason about picks[0] would explain
  // the wrong card. The opening-soon card already carries its actionable hours
  // evidence, so reserve "Why it leads" for a current place that truly leads.
  const leadReason = openingSoonFirst ? null : daypartLeadReason(active.picks);

  return (
    <section aria-label={shelfHeading.aria} className="mt-6">
      <TodaySectionHeading
        title={shelfHeading.title}
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
                className="tap-44 min-h-11 shrink-0 rounded-full border px-3 text-[12.5px] font-semibold transition active:scale-[0.98]"
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
        key={active.category}
        id="daypart-active-panel"
        role={rows.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={rows.length > 1 ? `daypart-tab-${active.category}` : undefined}
        className={`${rows.length > 1 ? "mt-2" : "mt-1"} today-decision-swap`}
      >
        {awaitingLive || shelfTier !== "confirmed" ? <div className="px-0.5">
          <p className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {awaitingLive
              ? "Checking nearby"
              : shelfTier === "likely"
                ? `${pickScopeLabel} · Posted hours; check before going`
                : `${pickScopeLabel} · Hours not confirmed; call ahead`}
          </p>
        </div> : null}

        {awaitingLive ? (
          <div
            className="today-answer-shelf mt-2 flex gap-2.5 overflow-hidden pb-1"
            aria-busy="true"
            aria-label={`Loading open ${active.label.toLocaleLowerCase()} places`}
          >
            {/* Mirrors the loaded shape (grid on phones, rail from sm) so the
                answer does not jump from a row to a grid when it arrives. */}
            {[0, 1, 2].map((slot) => (
              <div
                key={slot}
                className="w-full shrink-0 sm:w-auto"
                data-shelf-lead={slot === 0 ? "true" : undefined}
              >
                <Skeleton.Block
                  width="100%"
                  height="7.35rem"
                  round="var(--app-radius-md)"
                  className={slot === 0 ? "sm:!w-[14.5rem]" : "sm:!w-[10.75rem]"}
                />
              </div>
            ))}
          </div>
        ) : active.picks.length > 0 || active.openingSoon ? (
          <div>
            {openingSoonFirst && active.openingSoon ? (
              <OpeningSoonPick
                place={active.openingSoon}
                category={active.category}
              />
            ) : null}
            {/* Phones get an edited grid, not a hidden horizontal rail. One
                lead and two alternatives fit as a complete decision set; See
                all owns the longer inventory. From sm up the same three cards
                become a rail, where the column has room. The decision role is
                layout-independent, so "Why it leads" keeps its subject. */}
            {visiblePicks.length > 0 ? (
              <ul
                ref={shelfRef}
                data-shelf-two={
                  active.openingSoon && visiblePicks.length === 2
                    ? "true"
                    : undefined
                }
                className="shelf-rail today-answer-shelf mt-2 gap-2.5 pb-1"
              >
                {visiblePicks.map((place, index) => (
                  <li
                    key={place.slug}
                    className="shrink-0"
                    data-shelf-lead={index === 0 ? "true" : undefined}
                  >
                    <DaypartPickCard
                      place={place}
                      category={active.category}
                      eager={index === 0}
                      lead={index === 0}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            {!openingSoonFirst && active.openingSoon ? (
              <OpeningSoonPick
                place={active.openingSoon}
                category={active.category}
              />
            ) : null}
            {leadReason ? (
              <p
                data-today-decision-reason="true"
                className="mt-2 flex items-baseline gap-2 px-0.5 text-[11.5px] leading-snug"
                style={{ color: "var(--app-ink-2)" }}
              >
                <span
                  className="shrink-0 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  Why it leads
                </span>
                <span>{leadReason}</span>
              </p>
            ) : null}
          </div>
        ) : (
          <div
            role="status"
            className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-elevated)",
              boxShadow: "var(--app-hi)",
            }}
          >
            <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              {daypartEmptyCopy(
                contextLabel,
                isDaypartCountywideContext(contextSource),
                liveActive?.mayAssertNoneOpen === true,
                active.label,
              )}
            </p>
            <Link
              href={active.href}
              prefetch={false}
              className="tap-44 shrink-0 text-[12px] font-semibold underline decoration-1 underline-offset-4"
              style={{ color: "var(--app-brand-press)" }}
            >
              Browse
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
