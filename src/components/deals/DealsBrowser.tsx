"use client";

import { useMemo, useState } from "react";
import { townAccent } from "@/lib/townAccent";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Tag } from "lucide-react";
import type { DealRow } from "@/lib/loaders/todaysDeals";
import DealLines from "@/components/happy/DealLines";

/**
 * DealsBrowser — the interactive, day-aware reveal for /deals. Sibling to
 * HappyHourBrowser, over the Field Notes DEALS corpus (the moat).
 *
 * A field-guide "almanac week": a 7-day strip shows how many verified specials
 * run each day (density at a glance, today marked), and tapping a day reveals
 * that day's deals, grouped into town chapters. Each row shows WHEN (the parsed
 * hours, accent mono) and the FULL offer (no truncation — the specifics are the
 * whole point). Deals with no fixed day sit honestly in a "Standing specials"
 * shelf rather than being pinned to a day they don't claim.
 *
 * No false "on now": deal hours are written loosely and inconsistently, so the
 * browser leads with the DAY and shows the hours as a datum, never a live
 * countdown it can't stand behind.
 */

const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function PhotoFallback() {
  return (
    <div aria-hidden className="grid h-full w-full place-items-center" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--app-brand) 30%, var(--app-brand-2)) 0%, var(--app-brand-2) 70%)" }}>
      <Tag className="h-5 w-5" strokeWidth={1.75} style={{ color: "color-mix(in srgb, var(--app-brand) 55%, #fff)" }} />
    </div>
  );
}

// A deterministic accent per town so each town reads as its own colored
// "chapter" of the guide (same family the Saved + happy-hour pages use).

export type DealVenueGroup = {
  venue: DealRow;
  offers: DealRow[];
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

function countLabel(offerCount: number, venueCount: number): string {
  return `${offerCount} ${offerCount === 1 ? "offer" : "offers"} at ${venueCount} ${venueCount === 1 ? "spot" : "spots"}`;
}

/** Dense field-guide card: one venue face with every applicable offer and its
 *  own hours retained below it. */
function RowCard({ group, accent, hideTown }: { group: DealVenueGroup; accent?: string; hideTown?: boolean }) {
  const r = group.venue;
  return (
    <article
      className="tactile-interactive relative flex gap-2.5 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2 pl-3"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-edge), var(--app-hi)" }}
    >
      {/* Chapter accent rail. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent ?? "var(--app-border)" }} />
      {/* Stretched link needs its own name — the card text is OUTSIDE the
          anchor, so without a label a screen reader announces nothing. */}
      <Link href={`/places/${r.slug}`} aria-label={r.name} className="block outline-none"><span className="absolute inset-0" aria-hidden /></Link>
      <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[10px]">
        {r.photo ? <Image src={r.photo} alt="" fill sizes="52px" unoptimized={r.photo.startsWith("/api/place-photo")} className="object-cover" /> : <PhotoFallback />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          {/* Truncate the NAME, never the town — a long venue name must not
              crush its town to "New ..." noise. */}
          <h3 className="flex min-w-0 items-baseline text-[14px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            <span className="min-w-0 truncate">{r.name}</span>
            {!hideTown && r.town && <span className="shrink-0 whitespace-pre font-normal" style={{ color: "var(--app-ink-3)" }}>{`  ·  ${r.town}`}</span>}
          </h3>
          {r.verified ? (
            <BadgeCheck role="img" aria-label="verified at the source" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-positive)" }} />
          ) : null}
        </div>
        <div className="mt-0.5 divide-y" style={{ borderColor: "var(--app-border)" }}>
          {group.offers.map((offer, index) => (
            <div key={`${offer.offer}-${index}`} className={index > 0 ? "mt-2 pt-2" : undefined}>
              {/* WHEN belongs to this offer, not the venue as a whole. */}
              {offer.hours && (
                <p className="font-mono text-[11.5px] font-semibold tabular-nums tracking-[0.01em]" style={{ color: "var(--app-ink-2)" }}>{offer.hours}</p>
              )}
              <DealLines deal={offer.offer} max={Number.MAX_SAFE_INTEGER} className="mt-0.5 space-y-0.5 text-[12.5px]" />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function DealsBrowser({ rows, today }: { rows: DealRow[]; today: number }) {
  const [day, setDay] = useState(today);

  const counts = useMemo(() => {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const r of rows) for (const d of new Set(r.days)) c[d]++;
    return c;
  }, [rows]);

  const dayed = useMemo(() => rows.filter((r) => r.days.length > 0), [rows]);
  const standing = useMemo(() => rows.filter((r) => r.days.length === 0), [rows]);
  const standingGroups = useMemo(() => groupDealsByVenue(standing), [standing]);

  const forDay = useMemo(() => {
    const list = dayed.filter((r) => r.days.includes(day));
    const venueGroups = groupDealsByVenue(list);
    // Group the day's venue cards into TOWN chapters.
    const groups = new Map<string, DealVenueGroup[]>();
    for (const group of venueGroups) {
      const town = group.venue.town || "Frederick County";
      (groups.get(town) ?? groups.set(town, []).get(town)!).push(group);
    }
    // Town order: most offers first, then name.
    const towns = [...groups.entries()].sort((a, b) =>
      b[1].reduce((sum, group) => sum + group.offers.length, 0) -
        a[1].reduce((sum, group) => sum + group.offers.length, 0) ||
      a[0].localeCompare(b[0]),
    );
    return { towns, isToday: day === today, offerCount: list.length, venueCount: venueGroups.length };
  }, [dayed, day, today]);

  return (
    <div className="space-y-4">
      {/* ── Week strip — the almanac. Each day shows its deal count; tap to
          browse that day. Today carries a dot. Mobile-first 7-up grid. */}
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LETTER.map((letter, d) => {
          const active = d === day;
          const isToday = d === today;
          const n = counts[d];
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-label={`${DAY_FULL[d]}: ${n} deal${n === 1 ? "" : "s"}`}
              aria-pressed={active}
              className="tactile-interactive flex flex-col items-center gap-1 rounded-[var(--app-radius-md)] py-2 transition"
              style={{
                background: active ? "var(--app-brand-press)" : "var(--app-bg-elevated)",
                boxShadow: active ? "var(--app-elev-1)" : "var(--app-edge), var(--app-hi)",
                border: active ? "none" : "1px solid var(--app-border)",
              }}
            >
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: active ? "var(--app-on-brand)" : "var(--app-ink-2)" }}>{letter}</span>
              <span className="font-mono text-[12px] font-bold tabular-nums leading-none" style={{ color: active ? "var(--app-on-brand)" : n > 0 ? "var(--app-ink)" : "var(--app-ink-3)" }}>{n || "·"}</span>
              <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: isToday ? (active ? "var(--app-on-brand)" : "var(--app-accent)") : "transparent" }} />
            </button>
          );
        })}
      </div>

      {/* ── Selected day's reveal — dense rows, grouped by town chapter. */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{forDay.isToday ? "Today" : DAY_FULL[day]}</h2>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{countLabel(forDay.offerCount, forDay.venueCount)}</span>
        </div>

        {forDay.offerCount === 0 ? (
          <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[12.5px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            There are no verified deals on {DAY_FULL[day]} yet. Try another day.
          </p>
        ) : (
          <div className="space-y-3.5">
            {forDay.towns.map(([town, items]) => {
              const color = townAccent(town);
              const offerCount = items.reduce((sum, group) => sum + group.offers.length, 0);
              return (
                <section key={town} className="space-y-2">
                  <header className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-1.5" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                    <span aria-hidden className="block h-5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                    <h3 className="min-w-0 flex-1 truncate font-serif text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{town}</h3>
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>{countLabel(offerCount, items.length)}</span>
                  </header>
                  <ul className="space-y-2">
                    {items.map((group) => (
                      <li key={group.venue.slug}><RowCard group={group} accent={color} hideTown /></li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Standing specials shelf — verified deals with no fixed day (e.g.
          "all-day", everyday specials); shown honestly rather than pinned to
          a weekday they don't claim. */}
      {standingGroups.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--app-ink-2)" }}>Standing specials</h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{countLabel(standing.length, standingGroups.length)}</span>
          </div>
          <ul className="space-y-2">
            {standingGroups.map((group) => (<li key={`${group.venue.slug}-s`}><RowCard group={group} /></li>))}
          </ul>
        </div>
      )}
    </div>
  );
}
