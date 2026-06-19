"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Tag } from "lucide-react";
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
const TOWN_ACCENTS = ["#E14328", "#20506A", "#1E6B3A", "#7E2C6F", "#B07A1E", "#3F5E8F"];
function townAccent(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return TOWN_ACCENTS[Math.abs(h) % TOWN_ACCENTS.length];
}

/** Dense field-guide row: a colored chapter rail + 52px thumb, then the venue,
 *  the hours (accent mono), and the FULL offer. */
function RowCard({ r, accent, hideTown }: { r: DealRow; accent?: string; hideTown?: boolean }) {
  return (
    <article
      className="tactile-interactive relative flex gap-2.5 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2 pl-3"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-edge), var(--app-hi)" }}
    >
      {/* Chapter accent rail. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent ?? "var(--app-border)" }} />
      <Link href={`/places/${r.slug}`} className="block outline-none"><span className="absolute inset-0" aria-hidden /></Link>
      <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[10px]">
        {r.photo ? <Image src={r.photo} alt="" fill sizes="52px" className="object-cover" /> : <PhotoFallback />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 truncate text-[14px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {r.name}
            {!hideTown && r.town && <span className="font-normal" style={{ color: "var(--app-ink-3)" }}>{`  ·  ${r.town}`}</span>}
          </h3>
          {r.verified ? (
            <span aria-label="verified" title="verified at the source" className="shrink-0 font-mono text-[11px] font-bold leading-none" style={{ color: "var(--app-positive)" }}>✓</span>
          ) : null}
        </div>
        {/* WHEN (accent mono, when stated), then the offer as clean clause lines
            — each figure glued to what it's for, never one bare number. */}
        {r.hours && (
          <p className="mt-0.5 font-mono text-[11.5px] font-semibold tabular-nums tracking-[0.01em]" style={{ color: "var(--app-ink-2)" }}>{r.hours}</p>
        )}
        <DealLines deal={r.offer} max={4} className="mt-0.5 space-y-0.5 text-[12.5px]" />
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

  const forDay = useMemo(() => {
    const list = dayed.filter((r) => r.days.includes(day));
    // Group the day's deals into TOWN chapters.
    const groups = new Map<string, DealRow[]>();
    for (const r of list) {
      const town = r.town || "Frederick County";
      (groups.get(town) ?? groups.set(town, []).get(town)!).push(r);
    }
    for (const arr of groups.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    // Town order: most deals first, then name.
    const towns = [...groups.entries()].sort((a, b) =>
      b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
    return { towns, isToday: day === today, total: list.length };
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
                background: active ? "var(--app-brand)" : "var(--app-bg-elevated)",
                boxShadow: active ? "var(--app-elev-1)" : "var(--app-edge), var(--app-hi)",
                border: active ? "none" : "1px solid var(--app-border)",
              }}
            >
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: active ? "#fff" : "var(--app-ink-2)" }}>{letter}</span>
              <span className="font-mono text-[12px] font-bold tabular-nums leading-none" style={{ color: active ? "#fff" : n > 0 ? "var(--app-ink)" : "var(--app-ink-3)" }}>{n || "·"}</span>
              <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: isToday ? (active ? "#fff" : "var(--app-accent)") : "transparent" }} />
            </button>
          );
        })}
      </div>

      {/* ── Selected day's reveal — dense rows, grouped by town chapter. */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{forDay.isToday ? "Today" : DAY_FULL[day]}</h2>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{forDay.total}</span>
        </div>

        {forDay.total === 0 ? (
          <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[12.5px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            No verified deals on {DAY_FULL[day]} yet. Try another day.
          </p>
        ) : (
          <div className="space-y-3.5">
            {forDay.towns.map(([town, items]) => {
              const color = townAccent(town);
              return (
                <section key={town} className="space-y-2">
                  <header className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-1.5" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                    <span aria-hidden className="block h-5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                    <h3 className="min-w-0 flex-1 truncate font-serif text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{town}</h3>
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{items.length}</span>
                  </header>
                  <ul className="space-y-2">
                    {items.map((r, i) => (
                      <li key={`${r.slug}-${i}`}><RowCard r={r} accent={color} hideTown /></li>
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
      {standing.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--app-ink-2)" }}>Standing specials</h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{standing.length}</span>
          </div>
          <ul className="space-y-2">
            {standing.map((r, i) => (<li key={`${r.slug}-s-${i}`}><RowCard r={r} /></li>))}
          </ul>
        </div>
      )}
    </div>
  );
}
