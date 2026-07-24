"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import CategoryGraphic from "@/components/ui/CategoryGraphic";
import type { DaypartPick, DaypartRow } from "@/lib/loaders/daypartPicks";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { getWantAnswer } from "@/lib/want-cache";
import { GEOLOCATION_CHANGE_EVENT } from "@/hooks/useGeolocation";
import { SCOPE_CHANGE_EVENT } from "@/lib/scope";
import Skeleton from "@/components/ui/Skeleton";

type WantRow = {
  slug: string;
  name: string;
  photo: string | null;
  where: string | null;
  distance: string | null;
  fact: string;
};

type WantAnswer = {
  hero: WantRow | null;
  also: WantRow[];
  browseHref: string;
  contextLabel: string;
};

type LiveShelf = {
  picks: DaypartPick[];
  href: string;
  contextLabel: string;
};

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
        const open = [answer.hero, ...answer.also]
          .filter((row): row is WantRow => Boolean(row))
          .slice(0, 4)
          .map((row) => ({
            slug: row.slug,
            name: row.name,
            rating: null,
            photo: row.photo,
            photoCredit: null,
            where: row.where,
            distance: row.distance,
            fact: row.fact,
          }));
        setLiveShelves((previous) => ({
          ...previous,
          [baseActive.category]: {
            picks: open,
            href: answer.browseHref || baseActive.href,
            contextLabel: answer.contextLabel || "Across Frederick County",
          },
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

  return (
    <section aria-label="Open places right now" className="mt-6">
      <div className="flex items-end justify-between gap-3">
        <SectionHeading title="Open now" />
        <p
          className="pb-0.5 text-right font-mono text-[10px] font-medium"
          style={{ color: "var(--app-ink-3)" }}
        >
          {contextLabel}
        </p>
      </div>
      {note ? (
        <p className="mt-1 px-0.5 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
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
        <div className="flex items-center justify-between gap-3 px-0.5">
          <p className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {awaitingLive ? "Checking nearby" : `${active.picks.length} confirmed open`}
          </p>
          <Link
            href={active.href}
            aria-label={`See all ${active.label.toLocaleLowerCase()} places`}
            className="tap-44-y inline-flex items-center gap-0.5 text-[11.5px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            See all
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
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
          <ul className="mt-2 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {active.picks.map((place) => (
              <li key={place.slug} className="shrink-0">
                <Link
                  href={`/places/${place.slug}`}
                  prefetch={false}
                  aria-label={`${place.name}, open now`}
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
                        style={{ background: "var(--app-positive)" }}
                      />
                      {place.fact || "Open now"}
                      {place.distance ? <span>· {place.distance}</span> : null}
                      {!place.distance && place.where ? <span>· {place.where}</span> : null}
                      {!place.fact && place.rating ? <span>· {place.rating.toFixed(1)}★</span> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="mt-2 rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-[12.5px]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            Nothing in this group is confirmed open right now. Use “See all”
            for places opening later.
          </p>
        )}
      </div>
    </section>
  );
}
