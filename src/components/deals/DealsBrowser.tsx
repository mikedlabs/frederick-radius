"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Search,
  Tag,
  X,
} from "lucide-react";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { townAccent } from "@/lib/townAccent";
import { todayDealAvailability, type DealAvailability } from "@/lib/today/dealAvailability";
import {
  dealHoursForDay,
  dealOfferForDay,
  type DealRow,
} from "@/lib/loaders/todaysDeals";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type DealDaySelection = number | "ongoing";

export type DealVenueGroup = {
  venue: DealRow;
  offers: DealRow[];
};

type DisplayOffer = {
  row: DealRow;
  offer: string;
  headline: string;
  hours?: string;
  availability?: DealAvailability;
};

const STATUS_COLOR: Record<DealAvailability["state"], string> = {
  now: "var(--app-positive)",
  later: "var(--app-accent-press)",
  today: "var(--app-ink-2)",
  earlier: "var(--app-ink-3)",
};

/** Collapse repeated source rows into one venue without dropping an offer. */
export function groupDealsByVenue(rows: DealRow[]): DealVenueGroup[] {
  const groups = new Map<string, DealVenueGroup>();
  for (const row of rows) {
    const current = groups.get(row.slug);
    if (current) current.offers.push(row);
    else groups.set(row.slug, { venue: row, offers: [row] });
  }
  return [...groups.values()].sort((a, b) => a.venue.name.localeCompare(b.venue.name));
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Search uses the selected day's projected offer rather than the source's
 * complete multi-day sentence. A Tuesday search should not match a Wednesday
 * clause that happens to live in the same source note.
 */
export function dealMatchesQuery(
  row: DealRow,
  query: string,
  day: DealDaySelection,
): boolean {
  const q = normalized(query);
  if (!q) return true;
  const offer = day === "ongoing" ? row.offer : dealOfferForDay(row, day);
  return normalized(
    [row.name, row.town, row.category, offer].filter(Boolean).join(" "),
  ).includes(q);
}

function compactHeadline(row: DealRow, offer: string): string {
  if (offer === row.offer && row.headline) return row.headline;
  const firstClause = offer.split(/;|\.\s+/)[0]?.trim() || offer.trim();
  if (firstClause.length <= 84) return firstClause;
  const naturalCut = firstClause.slice(0, 84).search(/,\s+|\s+(?:and|with|plus)\s+/);
  if (naturalCut >= 24) return firstClause.slice(0, naturalCut).trim();
  return firstClause;
}

function categoryLabel(category?: string): string {
  if (!category) return "Local special";
  return category
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function verifiedLabel(value: string | null): string {
  if (!value) return "Source checked";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function easternDayIndex(now: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
  const index = DAY_SHORT.indexOf(weekday);
  return index >= 0 ? index : 0;
}

export function selectionAfterDayRollover(
  selection: DealDaySelection,
  previousToday: number,
  nextToday: number,
): DealDaySelection {
  return selection === previousToday ? nextToday : selection;
}

export function synchronizeDealDay(
  selection: DealDaySelection,
  previousToday: number,
  browserNow: Date,
): { today: number; selection: DealDaySelection } {
  const today = easternDayIndex(browserNow);
  return {
    today,
    selection: selectionAfterDayRollover(selection, previousToday, today),
  };
}

export function shouldShowAvailableNow(
  day: DealDaySelection,
  today: number,
  liveCount: number,
  active: boolean,
): boolean {
  return day !== "ongoing" && day === today && (liveCount > 0 || active);
}

function countLabel(offerCount: number, venueCount: number): string {
  return `${offerCount} ${offerCount === 1 ? "offer" : "offers"} at ${venueCount} ${
    venueCount === 1 ? "place" : "places"
  }`;
}

function PhotoFallback() {
  return (
    <div
      aria-hidden
      className="grid h-full w-full place-items-center"
      style={{
        background:
          "linear-gradient(145deg, color-mix(in srgb, var(--app-brand) 22%, var(--app-bg-sunken)) 0%, color-mix(in srgb, var(--app-cool) 18%, var(--app-bg-sunken)) 100%)",
      }}
    >
      <Tag
        className="h-9 w-9"
        strokeWidth={1.45}
        style={{ color: "color-mix(in srgb, var(--app-brand) 58%, var(--app-ink-3))" }}
      />
    </div>
  );
}

function OfferStatus({
  availability,
  hours,
}: {
  availability?: DealAvailability;
  hours?: string;
}) {
  if (!availability && !hours) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px]">
      {availability ? (
        <span
          className="inline-flex items-center gap-1.5 font-semibold"
          style={{ color: STATUS_COLOR[availability.state] }}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: STATUS_COLOR[availability.state] }}
          />
          {availability.label}
        </span>
      ) : null}
      {hours ? (
        <span
          className="inline-flex items-center gap-1.5 font-mono tabular-nums"
          style={{ color: "var(--app-ink-2)" }}
        >
          <Clock3 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {hours}
        </span>
      ) : null}
    </div>
  );
}

function OfferEntry({ item }: { item: DisplayOffer }) {
  const detailNeeded = normalized(item.offer) !== normalized(item.headline);
  return (
    <li className="space-y-2 border-t py-3 first:border-t-0 first:pt-0" style={{ borderColor: "var(--app-border)" }}>
      <p
        className="text-[17px] font-semibold leading-[1.2] tracking-[-0.015em] [text-wrap:pretty] sm:text-[18px]"
        style={{ color: "var(--app-ink)" }}
      >
        {item.headline}
      </p>
      <OfferStatus availability={item.availability} hours={item.hours} />
      {item.row.terms ? (
        <p className="text-[12px] font-medium" style={{ color: "var(--app-ink-3)" }}>
          {item.row.terms}
        </p>
      ) : null}
      {detailNeeded ? (
        <details className="group/details">
          <summary
            className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold [&::-webkit-details-marker]:hidden"
            style={{ color: "var(--app-brand-press)" }}
          >
            Full details
            <ChevronRight
              aria-hidden
              className="h-3.5 w-3.5 transition-transform group-open/details:rotate-90 motion-reduce:transition-none"
              strokeWidth={2.25}
            />
          </summary>
          <p
            className="rounded-[var(--app-radius-sm)] px-3 py-2.5 text-[12.5px] leading-relaxed"
            style={{
              background: "var(--app-bg-sunken)",
              color: "var(--app-ink-2)",
            }}
          >
            {item.offer}
          </p>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span
          className="inline-flex min-h-8 items-center gap-1.5 text-[11px] font-medium"
          style={{ color: "var(--app-positive)" }}
        >
          <BadgeCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          {verifiedLabel(item.row.verified)}
        </span>
        {item.row.source_url ? (
          <a
            href={item.row.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold hover:bg-[var(--app-bg-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--app-brand)]"
            style={{ color: "var(--app-cool)" }}
            aria-label={`Check source for ${item.headline} at ${item.row.name}`}
          >
            Check source
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </a>
        ) : null}
      </div>
    </li>
  );
}

function DealCard({
  group,
  day,
  today,
  now,
  featured = false,
}: {
  group: DealVenueGroup;
  day: DealDaySelection;
  today: number;
  now: Date;
  featured?: boolean;
}) {
  const venue = group.venue;
  const color = townAccent(venue.town || "Frederick County");
  const isActualToday = day !== "ongoing" && day === today;
  const offers = group.offers
    .map((row): DisplayOffer => {
      const offer = day === "ongoing" ? row.offer : dealOfferForDay(row, day);
      const hours = day === "ongoing" ? row.hours : dealHoursForDay(row, day);
      return {
        row,
        offer,
        headline: compactHeadline(row, offer),
        hours,
        availability: isActualToday
          ? todayDealAvailability(hours, DAY_FULL[today], now)
          : undefined,
      };
    })
    .sort(
      (a, b) =>
        (a.availability?.rank ?? 2) - (b.availability?.rank ?? 2) ||
        a.headline.localeCompare(b.headline),
    );
  const photo = venue.photo
    ? proxyPhotoAtWidth(venue.photo, featured ? 720 : 520)
    : undefined;

  return (
    <article
      className={`relative h-full overflow-hidden rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] ${
        featured
          ? "sm:col-span-2 sm:grid sm:grid-cols-[minmax(15rem,0.88fr)_minmax(0,1.12fr)]"
          : "flex flex-col"
      }`}
      style={{
        borderColor: featured
          ? "color-mix(in srgb, var(--app-positive) 26%, var(--app-border))"
          : "var(--app-border)",
        boxShadow: featured
          ? "var(--app-elev-2), var(--app-edge), var(--app-hi)"
          : "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <div
        className={`relative overflow-hidden ${
          featured ? "h-44 sm:h-full sm:min-h-[18rem]" : "h-32 sm:h-36"
        }`}
      >
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            sizes={
              featured
                ? "(min-width: 1024px) 400px, (min-width: 640px) 40vw, 100vw"
                : "(min-width: 1024px) 440px, (min-width: 640px) 50vw, 100vw"
            }
            loading={featured ? "eager" : "lazy"}
            fetchPriority={featured ? "high" : "auto"}
            unoptimized={photo.startsWith("/api/place-photo")}
            className="object-cover transition-transform duration-500 hover:scale-[1.025] motion-reduce:transition-none"
          />
        ) : (
          <PhotoFallback />
        )}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-16"
          style={{ background: "linear-gradient(transparent, rgba(24, 20, 16, 0.42))" }}
        />
        <span
          className="absolute bottom-2.5 left-3 inline-flex min-h-7 items-center rounded-full px-2.5 text-[10px] font-semibold text-white backdrop-blur-sm"
          style={{ background: "rgba(24, 20, 16, 0.62)" }}
        >
          {categoryLabel(venue.category)}
        </span>
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1"
          style={{ background: color }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <header className="space-y-1">
          <h3 className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">
            <Link
              href={`/places/${venue.slug}`}
              className="tap-44-y inline-flex items-center rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--app-brand)]"
              style={{ color: "var(--app-ink)" }}
            >
              {venue.name}
            </Link>
          </h3>
          <p
            className="flex items-center gap-1.5 text-[12px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {venue.town || "Frederick County"}
          </p>
        </header>

        <ul className="mt-4 flex-1">
          {offers.map((item, index) => (
            <OfferEntry
              key={`${item.row.slug}-${item.offer}-${index}`}
              item={item}
            />
          ))}
        </ul>

        <footer
          className="mt-3 flex justify-end border-t pt-2"
          style={{ borderColor: "var(--app-border)" }}
        >
          <Link
            href={`/places/${venue.slug}`}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold hover:bg-[var(--app-bg-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--app-brand)]"
            style={{ color: "var(--app-brand-press)" }}
          >
            Place details
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        </footer>
      </div>
    </article>
  );
}

export default function DealsBrowser({
  rows,
  today,
  nowIso,
}: {
  rows: DealRow[];
  today: number;
  nowIso: string;
}) {
  const [day, setDay] = useState<DealDaySelection>(today);
  const [query, setQuery] = useState("");
  const [town, setTown] = useState("all");
  const [onlyNow, setOnlyNow] = useState(false);
  const [clock, setClock] = useState(() => new Date(nowIso));
  const [clientReady, setClientReady] = useState(false);
  const previousToday = useRef(today);
  const currentToday = easternDayIndex(clock);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      const nextClock = new Date();
      const previous = previousToday.current;
      const nextToday = easternDayIndex(nextClock);
      setClock(nextClock);
      if (nextToday !== previous) {
        setDay((selection) =>
          synchronizeDealDay(selection, previous, nextClock).selection,
        );
        setOnlyNow(false);
        previousToday.current = nextToday;
      }
    };
    // Synchronize away any ISR-cached timestamp before enabling controls. The
    // updates batch into one commit, so a fast first tap cannot land between a
    // stale day and the browser's real Frederick time.
    tick();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClientReady(true);
    const interval = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const counts = useMemo(() => {
    const perDay = [0, 0, 0, 0, 0, 0, 0];
    let ongoing = 0;
    for (const row of rows) {
      if (row.days.length === 0) ongoing += 1;
      for (const value of new Set(row.days)) perDay[value] += 1;
    }
    return { perDay, ongoing };
  }, [rows]);

  const selectedRows = useMemo(
    () =>
      day === "ongoing"
        ? rows.filter((row) => row.days.length === 0)
        : rows.filter((row) => row.days.includes(day)),
    [day, rows],
  );

  const townOptions = useMemo(() => {
    const venues = new Map<string, Set<string>>();
    for (const row of selectedRows) {
      const label = row.town || "Frederick County";
      const slugs = venues.get(label) ?? new Set<string>();
      slugs.add(row.slug);
      venues.set(label, slugs);
    }
    return [...venues.entries()]
      .map(([label, slugs]) => ({ label, count: slugs.size }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [selectedRows]);

  const matchingRows = useMemo(
    () =>
      selectedRows.filter((row) => {
        if (town !== "all" && (row.town || "Frederick County") !== town) {
          return false;
        }
        return dealMatchesQuery(row, query, day);
      }),
    [day, query, selectedRows, town],
  );

  const liveCount = useMemo(() => {
    if (day === "ongoing" || day !== currentToday) return 0;
    return matchingRows.filter((row) => {
      const hours = dealHoursForDay(row, day);
      return todayDealAvailability(hours, DAY_FULL[currentToday], clock).state === "now";
    }).length;
  }, [clock, currentToday, day, matchingRows]);

  const filteredRows = useMemo(
    () =>
      matchingRows.filter((row) => {
        if (onlyNow && day !== "ongoing") {
          const hours = dealHoursForDay(row, day);
          return todayDealAvailability(
            hours,
            DAY_FULL[currentToday],
            clock,
          ).state === "now";
        }
        return true;
      }),
    [clock, currentToday, day, matchingRows, onlyNow],
  );

  const groups = useMemo(() => {
    const result = groupDealsByVenue(filteredRows);
    if (day === "ongoing" || day !== currentToday) return result;
    const rank = (group: DealVenueGroup) =>
      Math.min(
        ...group.offers.map((row) =>
          todayDealAvailability(
            dealHoursForDay(row, day),
            DAY_FULL[currentToday],
            clock,
          ).rank,
        ),
      );
    return result.sort(
      (a, b) => rank(a) - rank(b) || a.venue.name.localeCompare(b.venue.name),
    );
  }, [clock, currentToday, day, filteredRows]);

  const featuredSlug =
    day !== "ongoing" &&
    day === currentToday &&
    !query &&
    town === "all" &&
    !onlyNow
      ? groups.find((group) =>
          group.offers.some(
            (row) =>
              todayDealAvailability(
                dealHoursForDay(row, day),
                DAY_FULL[currentToday],
                clock,
              ).state === "now",
          ),
        )?.venue.slug
      : undefined;

  const selectedLabel = day === "ongoing" ? "Ongoing offers" : `${DAY_FULL[day]} deals`;
  const hasFilters = Boolean(query || town !== "all" || onlyNow);

  const chooseDay = (
    value: DealDaySelection,
    button: HTMLButtonElement,
  ) => {
    setDay(value);
    setOnlyNow(false);
    if (
      town !== "all" &&
      !rows.some(
        (row) =>
          (value === "ongoing" ? row.days.length === 0 : row.days.includes(value)) &&
          (row.town || "Frederick County") === town,
      )
    ) {
      setTown("all");
    }
    button.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
      inline: "center",
    });
  };

  const clearFilters = () => {
    setQuery("");
    setTown("all");
    setOnlyNow(false);
  };

  return (
    <section
      aria-labelledby="deal-finder-heading"
      className="space-y-6"
      data-deals-ready={clientReady ? "true" : "false"}
    >
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3 px-0.5">
          <div>
            <p
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Plan the week
            </p>
            <h2
              id="deal-finder-heading"
              className="mt-1 text-[19px] font-semibold tracking-[-0.02em]"
              style={{ color: "var(--app-ink)" }}
            >
              Pick a day
            </h2>
          </div>
          <p className="text-right text-[11px] sm:hidden" style={{ color: "var(--app-ink-3)" }}>
            Swipe for more
          </p>
        </div>

        <div className="relative" data-deal-day-rail>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            <div
              className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-8"
              role="group"
              aria-label="Choose a day for deals"
            >
              {DAY_SHORT.map((label, value) => {
                const active = day === value;
                const isToday = currentToday === value;
                const count = counts.perDay[value];
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!clientReady}
                    onClick={(event) => chooseDay(value, event.currentTarget)}
                    aria-pressed={active}
                    aria-label={`${DAY_FULL[value]}: ${count} ${
                      count === 1 ? "offer" : "offers"
                    }${isToday ? ", today" : ""}`}
                    className="tactile-interactive flex min-h-[64px] min-w-[64px] flex-col items-center justify-center rounded-[var(--app-radius-md)] border px-2 transition-colors motion-reduce:transition-none sm:min-w-0"
                    style={{
                      borderColor: active
                        ? "var(--app-brand-press)"
                        : "var(--app-border)",
                      background: active
                        ? "var(--app-brand-press)"
                        : "var(--app-bg-elevated)",
                      color: active ? "var(--app-on-brand)" : "var(--app-ink)",
                      boxShadow: active
                        ? "var(--app-elev-1)"
                        : "var(--app-edge), var(--app-hi)",
                    }}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
                      {label}
                    </span>
                    <span className="mt-0.5 font-mono text-[16px] font-bold tabular-nums leading-none">
                      {count}
                    </span>
                    <span
                      className="mt-1 text-[8px] font-semibold uppercase tracking-[0.09em]"
                      style={{
                        color: active
                          ? "color-mix(in srgb, var(--app-on-brand) 78%, transparent)"
                          : isToday
                            ? "var(--app-brand-press)"
                            : "var(--app-ink-3)",
                      }}
                    >
                      {isToday ? "Today" : count === 1 ? "offer" : "offers"}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                disabled={!clientReady}
                onClick={(event) => chooseDay("ongoing", event.currentTarget)}
                aria-pressed={day === "ongoing"}
                aria-label={`Ongoing offers: ${counts.ongoing}`}
                className="tactile-interactive flex min-h-[64px] min-w-[76px] flex-col items-center justify-center rounded-[var(--app-radius-md)] border px-2 transition-colors motion-reduce:transition-none sm:min-w-0"
                style={{
                  borderColor:
                    day === "ongoing" ? "var(--app-cool)" : "var(--app-border)",
                  background:
                    day === "ongoing" ? "var(--app-cool)" : "var(--app-bg-elevated)",
                  color:
                    day === "ongoing" ? "var(--app-on-brand)" : "var(--app-ink)",
                  boxShadow:
                    day === "ongoing"
                      ? "var(--app-elev-1)"
                      : "var(--app-edge), var(--app-hi)",
                }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.05em]">
                  Ongoing
                </span>
                <span className="mt-0.5 font-mono text-[16px] font-bold tabular-nums leading-none">
                  {counts.ongoing}
                </span>
                <span
                  className="mt-1 text-[8px] font-semibold uppercase tracking-[0.09em]"
                  style={{
                    color:
                      day === "ongoing"
                        ? "color-mix(in srgb, var(--app-on-brand) 78%, transparent)"
                        : "var(--app-ink-3)",
                  }}
                >
                  Any day
                </span>
              </button>
            </div>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-4 inset-y-0 flex w-10 items-center justify-end sm:hidden"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--app-bg) 78%)",
            }}
          >
            <ChevronRight
              className="h-4 w-4"
              strokeWidth={2.25}
              style={{ color: "var(--app-ink-3)" }}
            />
          </div>
        </div>
      </div>

      <div
        className="rounded-[var(--app-radius-xl)] border p-3 sm:p-4"
        style={{
          borderColor: "var(--app-border)",
          background:
            "color-mix(in srgb, var(--app-bg-elevated) 92%, transparent)",
          boxShadow: "var(--app-edge), var(--app-hi)",
        }}
      >
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.42fr)_auto]">
          <label className="relative block">
            <span className="sr-only">Search deals</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              strokeWidth={2}
              style={{ color: "var(--app-ink-3)" }}
            />
            <input
              type="search"
              disabled={!clientReady}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search wings, oysters, a place..."
              className="min-h-11 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-brand)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-brand)_16%,transparent)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            />
          </label>

          <label className="relative block">
            <span className="sr-only">Filter deals by town</span>
            <select
              disabled={!clientReady}
              value={town}
              onChange={(event) => setTown(event.target.value)}
              className="min-h-11 w-full appearance-none rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] px-3 pr-8 text-[13px] font-medium outline-none focus:border-[var(--app-brand)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-brand)_16%,transparent)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            >
              <option value="all">All towns</option>
              {townOptions.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
            <ChevronRight
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90"
              strokeWidth={2}
              style={{ color: "var(--app-ink-3)" }}
            />
          </label>

          {shouldShowAvailableNow(day, currentToday, liveCount, onlyNow) ? (
            <button
              type="button"
              disabled={!clientReady}
              aria-pressed={onlyNow}
              onClick={() => setOnlyNow((value) => !value)}
              className="tactile-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border px-3 text-[12px] font-semibold sm:whitespace-nowrap"
              style={{
                borderColor: onlyNow
                  ? "var(--app-positive)"
                  : "var(--app-border)",
                background: onlyNow
                  ? "color-mix(in srgb, var(--app-positive) 12%, var(--app-bg-elevated))"
                  : "var(--app-bg-elevated-solid)",
                color: onlyNow ? "var(--app-positive)" : "var(--app-ink-2)",
              }}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: "var(--app-positive)" }}
              />
              Available now ({liveCount})
            </button>
          ) : null}
        </div>

        {hasFilters && groups.length > 0 ? (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-semibold hover:bg-[var(--app-bg-sunken)]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      <section
        aria-labelledby="deal-results-heading"
        className="space-y-3"
        data-deals-results
      >
        <header className="flex flex-wrap items-end justify-between gap-2 px-0.5">
          <div>
            <h2
              id="deal-results-heading"
              className="text-[21px] font-semibold tracking-[-0.025em]"
              style={{ color: "var(--app-ink)" }}
            >
              {selectedLabel}
            </h2>
            <p
              aria-live="polite"
              aria-atomic="true"
              className="mt-0.5 font-mono text-[11px] tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {countLabel(filteredRows.length, groups.length)}
              {town !== "all" ? ` in ${town}` : ""}
            </p>
          </div>
          {day === "ongoing" ? (
            <p className="max-w-[30ch] text-right text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              These offers do not name one fixed weekday.
            </p>
          ) : null}
        </header>

        {groups.length === 0 ? (
          <div
            className="rounded-[var(--app-radius-xl)] border border-dashed px-5 py-12 text-center"
            style={{
              borderColor: "var(--app-border)",
              background: "color-mix(in srgb, var(--app-bg-elevated) 62%, transparent)",
            }}
          >
            <Tag
              aria-hidden
              className="mx-auto h-7 w-7"
              strokeWidth={1.6}
              style={{ color: "var(--app-ink-3)" }}
            />
            <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
              No matching deals
            </p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              Try another day, town, or search.
            </p>
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="tactile-interactive mt-4 min-h-11 rounded-full border px-4 text-[12px] font-semibold"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-elevated)",
                  color: "var(--app-brand-press)",
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {groups.map((group) => (
              <li
                key={group.venue.slug}
                className={group.venue.slug === featuredSlug ? "md:col-span-2" : undefined}
                data-deal-card
              >
                <DealCard
                  group={group}
                  day={day}
                  today={currentToday}
                  now={clock}
                  featured={group.venue.slug === featuredSlug}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
