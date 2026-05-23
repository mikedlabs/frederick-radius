"use client";

import { useMemo } from "react";
import { useSavedList, useMounted } from "@/hooks/useSaved";
// Client-safe: slim pre-decorated set, NOT @/lib/loaders/places
// (that static-imports the ~12MB enrichment into the browser).
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import { EVENT_BY_SLUG } from "@/data/events";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import Link from "next/link";
import { Bookmark, MapPin, Sparkles } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";

type DecoratedEvent = ReturnType<typeof decorateEvent>;

function decorateEvent(e: NonNullable<(typeof EVENT_BY_SLUG)[string]>) {
  return {
    ...e,
    distance_m: undefined,
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
  };
}

/** Curated seeds for the empty state — six Frederick favorites that
 *  most visitors should know about. Picked by category breadth so the
 *  list shows the *shape* of the directory, not just food. Slugs match
 *  the canonical -town suffix form in places-client.json. */
const EMPTY_SEEDS: Array<{ slug: string; reason: string }> = [
  { slug: "monocacy-national-battlefield-frederick", reason: "The battle that saved Washington in 1864." },
  { slug: "carroll-creek-linear-park-frederick", reason: "Downtown's water + art park." },
  { slug: "olde-mother-brewing-frederick", reason: "Hometown brewery, year-round taproom." },
  { slug: "schifferstadt-architectural-museum-frederick", reason: "The county's oldest house, still standing." },
  { slug: "national-museum-civil-war-medicine-frederick", reason: "Small museum, big story." },
  { slug: "sky-stage", reason: "Outdoor stage built inside a ruin." },
];

export default function SavedList() {
  const mounted = useMounted();
  const items = useSavedList();

  const { places, events, byCategory, townTally } = useMemo(() => {
    const places = items
      .filter((i) => i.type === "place")
      .map((i) => ({ ref: i, place: clientPlaceBySlug(i.id) }))
      .filter((x): x is { ref: typeof x.ref; place: PlaceCardData } => Boolean(x.place))
      .sort((a, b) => +new Date(b.ref.saved_at) - +new Date(a.ref.saved_at))
      .map((x) => x.place);

    const events = items
      .filter((i) => i.type === "event")
      .map((i) => EVENT_BY_SLUG[i.id])
      .filter(Boolean)
      .map(decorateEvent);

    // Bucket places by their top-level category — gives the page a
    // "shape" so the user can scan what kind of Frederick they're
    // collecting (mostly food, mostly outdoors, a mix).
    const byCategory = new Map<string, PlaceCardData[]>();
    for (const p of places) {
      const top = CATEGORY_BY_SLUG[p.category]?.parent ?? p.category;
      const arr = byCategory.get(top) ?? [];
      arr.push(p);
      byCategory.set(top, arr);
    }

    // Town tally — if a town dominates, the page can surface a "make a
    // route" suggestion. Only counts places (events have venues but
    // their town signal is noisier).
    const townTally = new Map<string, number>();
    for (const p of places) {
      townTally.set(p.municipality, (townTally.get(p.municipality) ?? 0) + 1);
    }

    return { places, events, byCategory, townTally };
  }, [items]);

  if (!mounted) {
    // Pre-hydration: render skeleton rows that match the real
    // populated state's layout, so there's no layout jump when the
    // localStorage read resolves a moment later.
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton.Block height={88} round="var(--app-radius-lg)" />
        <Skeleton.Block height={56} round="var(--app-radius-md)" />
        <Skeleton.Row />
        <Skeleton.Row />
        <Skeleton.Row />
      </div>
    );
  }

  if (items.length === 0) return <EmptyState />;

  // Cluster signal: if ≥3 places are in one town, suggest a route.
  const dominantTown = [...townTally.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])[0];
  const dominantMuni = dominantTown
    ? MUNICIPALITY_BY_SLUG[dominantTown[0]]
    : null;

  return (
    <div className="space-y-5">
      {/* Personal hero — the "your Frederick" briefing. Stitches the
          tallies into one editorial sentence; the bar of stat pills
          underneath gives the at-a-glance read without a heavy 4-cell
          dark stat block. */}
      <section
        aria-label="Your Frederick"
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 110% at 100% 0%, color-mix(in srgb, var(--app-brand) 14%, transparent), transparent 60%)",
          }}
        />
        <div className="relative space-y-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 16%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <Bookmark className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </span>
            <p
              className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Your Frederick
            </p>
          </div>
          <p
            className="font-serif text-[20px] font-semibold leading-snug tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {summarySentence(places.length, events.length, townTally.size)}
          </p>
          <p className="text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            Saved on this device · sync coming soon
          </p>
        </div>
      </section>

      {/* Smart suggestion strip — only when there's a real cluster. */}
      {dominantMuni && (
        <Link
          href={`/plan?from=saved`}
          className="group flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition active:scale-[0.99]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span
            aria-hidden
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
              color: "var(--app-cool)",
            }}
          >
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block text-[13px] font-semibold leading-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {dominantTown![1]} of your saves are in {dominantMuni.name}
            </span>
            <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
              Build a route from these → Planner
            </span>
          </span>
          <span
            aria-hidden
            className="text-[11px] font-bold transition-transform group-hover:translate-x-0.5"
            style={{ color: "var(--app-ink-3)" }}
          >
            →
          </span>
        </Link>
      )}

      {/* Places, grouped by their top-level category. The reader scans
          the shape of their collection — mostly food, or a mix. */}
      {byCategory.size > 0 && (
        <div className="space-y-5">
          {[...byCategory.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([catSlug, group]) => {
              const cat = CATEGORY_BY_SLUG[catSlug];
              const color = cat?.color ?? "var(--app-cool)";
              return (
                <section key={catSlug} className="space-y-2">
                  <header className="flex items-baseline gap-2.5">
                    <span
                      aria-hidden
                      className="block h-[3px] w-7 rounded-full"
                      style={{ background: color }}
                    />
                    <h2
                      className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
                      style={{ color }}
                    >
                      {cat?.name ?? catSlug}
                    </h2>
                    <span
                      className="rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                      style={{
                        background: `color-mix(in srgb, ${color} 14%, transparent)`,
                        color,
                      }}
                    >
                      {group.length}
                    </span>
                  </header>
                  <ul className="space-y-2">
                    {group.map((p) => (
                      <li key={p.slug}>
                        <PlaceCard place={p} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
        </div>
      )}

      {events.length > 0 && (
        <section aria-label="Saved events" className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-brand)" }}
            />
            <h2
              className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-brand)" }}
            >
              Events
            </h2>
            <span
              className="rounded-full px-1.5 text-[10px] font-bold tabular-nums"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              {events.length}
            </span>
          </header>
          <ul className="space-y-2">
            {events.map((e: DecoratedEvent) => (
              <li key={e.slug}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function summarySentence(placeN: number, eventN: number, townN: number): string {
  if (placeN === 0 && eventN === 0) return "Start building a list of places to come back to.";
  const parts: string[] = [];
  if (placeN > 0) parts.push(`${placeN} place${placeN === 1 ? "" : "s"}`);
  if (eventN > 0) parts.push(`${eventN} event${eventN === 1 ? "" : "s"}`);
  let body = parts.join(" and ");
  if (placeN > 0 && townN > 1) body += ` across ${townN} town${townN === 1 ? "" : "s"}`;
  return `${body}, waiting for your next visit.`;
}

/**
 * EmptyState — the first impression when nothing's saved. We don't
 * leave the page bare; we treat it as a soft pitch for *what saving
 * is for* and prime the pump with six curated seeds the visitor can
 * tap to learn about. Each seed has a one-sentence "why" so the
 * empty page reads as editorial, not as a debug placeholder.
 */
function EmptyState() {
  const seeds = EMPTY_SEEDS
    .map((s) => ({ ...s, place: clientPlaceBySlug(s.slug) }))
    .filter((s): s is typeof s & { place: PlaceCardData } => Boolean(s.place));

  return (
    <div className="space-y-5">
      <section
        aria-label="What is Saved?"
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-5 shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 110% at 0% 0%, color-mix(in srgb, var(--app-brand) 16%, transparent), transparent 60%)",
          }}
        />
        <div className="relative space-y-2">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 16%, transparent)",
              color: "var(--app-brand)",
            }}
          >
            <Bookmark className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </span>
          <p
            className="font-serif text-[20px] font-semibold leading-snug tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            A place to keep track of your Frederick.
          </p>
          <p className="text-[13px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
            Tap the bookmark on any place or event to pin it here. The list is
            yours, for things you&apos;ve been meaning to try, dates worth a return
            visit, or a list to send a friend who&apos;s coming through town.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/map"
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-[0.96]"
              style={{ background: "var(--app-brand)", color: "white" }}
            >
              <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Browse the map
            </Link>
            <Link
              href="/events"
              className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-[0.96]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            >
              See what&apos;s on
            </Link>
          </div>
        </div>
      </section>

      {seeds.length > 0 && (
        <section className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-cool)" }}
            />
            <h2
              className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-cool)" }}
            >
              Worth starting with
            </h2>
            <span
              className="ml-auto text-[10px] italic"
              style={{ color: "var(--app-ink-3)" }}
            >
              Curated · not yours yet
            </span>
          </header>
          <ul className="space-y-2">
            {seeds.map((s) => (
              <li key={s.slug} className="space-y-1.5">
                <p
                  className="px-1 text-[11.5px] italic"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {s.reason}
                </p>
                <PlaceCard place={s.place} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
