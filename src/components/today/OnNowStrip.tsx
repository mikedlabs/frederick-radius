import Link from "next/link";
import { Radio, Wine, ShoppingBasket, type LucideIcon } from "lucide-react";
import { placesWithFieldHappyHour } from "@/lib/loaders/fieldNotes";
// eslint-disable-next-line no-restricted-imports -- SERVER component (no "use client"): loader imports render server-side and never enter the client bundle
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { parseHappyHour, type HHWindow } from "@/lib/happyHour";
import { marketsOpenToday } from "@/lib/markets-today";
import { selectOnNowChips, type OnNowChip, type OnNowPour } from "@/lib/today/on-now";
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/**
 * OnNowStrip — the compact "On now around the county" live strip.
 *
 * Sits in the gap between the weather hero and the "I want…" grid, where a
 * copy-heavy seasonal band used to live (owner call, 2026-07-08). Low on prose:
 * two or three TAPPABLE chips, each a real thing happening this minute drawn
 * from data the page already has — a live event, a place open now (a verified
 * happy hour pouring), and today's farmers market (only if one is actually open
 * today). The selection + self-hide logic is the pure, unit-tested
 * selectOnNowChips; this component only resolves the loaders and paints.
 *
 * Honest by construction: each chip appears only when its slot is genuinely on,
 * and if nothing qualifies the whole strip renders nothing (no empty box).
 * Async server component; streams in its own Suspense boundary on /today.
 */

/** Eastern weekday (0=Sun) + minutes-since-midnight, for happy-hour windows. */
function easternDayMin(now: Date): { day: number; min: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: wd[get("weekday")] ?? 0, min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/** Verified happy hours whose window includes right now, resolved to a place —
 *  the same live-window signal HappyHourWallet rides, reduced to what the chip
 *  needs. */
function livePoursNow(now: Date): OnNowPour[] {
  const { day, min } = easternDayMin(now);
  const out: OnNowPour[] = [];
  for (const v of placesWithFieldHappyHour()) {
    const live = parseHappyHour(v.happy_hour.schedule).find(
      (w: HHWindow) => w.days.includes(day) && min >= w.start && min < w.end,
    );
    if (!live) continue;
    const p = clientPlaceBySlug(v.slug);
    if (!p) continue;
    out.push({
      slug: v.slug,
      name: p.name,
      endsAt: live.end,
      lastCall: live.end < 1440 && live.end - min <= 30,
    });
  }
  return out;
}

export default async function OnNowStrip({ now, eventsPromise }: { now: Date; eventsPromise: EventsPromise }) {
  const { publicEvents } = await eventsPromise;
  const markets = await marketsOpenToday(now);

  const chips = selectOnNowChips({
    now,
    events: publicEvents,
    pours: livePoursNow(now),
    markets: markets.map((m) => ({ name: m.name, hours: m.hours })),
  });

  if (chips.length === 0) return null;

  return (
    <section className="mt-3" aria-label="On now around the county">
      {/* "around the county", not "near you": this strip uses no location,
          it's the county-wide live layer (a live show, a happy hour
          pouring, a market open now). Claiming proximity we don't measure
          read as confusing (owner note). */}
      <h2 className="flex items-center gap-1.5 px-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
        <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
        On now around the county
      </h2>
      {/* Horizontal chip rail: scrolls rather than wraps so the strip stays one
          calm line on a narrow phone. Each chip is a full tap target. */}
      <div className="-mx-4 mt-1.5 px-4">
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((chip) => (
            <li key={`${chip.kind}-${chip.href}`} className="shrink-0">
              <OnNowChipCard chip={chip} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Per-kind glyph + ink, so a glance tells event from pour from market
 *  (the same icon-led row language the /nearby cards and the "I want to"
 *  cells use — one visual grammar across the app). */
const KIND: Record<OnNowChip["kind"], { Icon: LucideIcon; ink: string }> = {
  event: { Icon: Radio, ink: "var(--app-brand)" },
  place: { Icon: Wine, ink: "var(--app-accent)" },
  market: { Icon: ShoppingBasket, ink: "var(--app-brand-2)" },
};

function OnNowChipCard({ chip }: { chip: OnNowChip }) {
  const { Icon, ink } = KIND[chip.kind];
  // The pulse + vermilion ring are a LIVE claim, so they key on the selector's
  // live flag — the "Starts in N min" fallback chip stays calm, no false pulse.
  const live = chip.live === true;
  return (
    <Link
      href={chip.href}
      aria-label={`${chip.kicker}: ${chip.title}${chip.meta ? `, ${chip.meta}` : ""}`}
      className="tactile-interactive flex min-h-[44px] max-w-[16rem] items-center gap-2.5 rounded-[var(--app-radius-md)] px-2.5 py-2"
      style={{
        backgroundColor: "var(--app-bg-elevated-solid)",
        backgroundImage: "var(--app-paper-light)",
        boxShadow: "var(--app-elev-1), var(--app-hi), var(--app-edge)",
        border: live ? "1px solid color-mix(in srgb, var(--app-brand) 32%, var(--app-border))" : "1px solid transparent",
      }}
    >
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
        style={{
          background: `color-mix(in srgb, ${ink} 16%, var(--app-bg-elevated))`,
          boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 8%, transparent), var(--app-hi)",
          color: `color-mix(in srgb, ${ink} 82%, var(--app-ink))`,
        }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="inline-flex items-center gap-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em]"
          style={{ color: live ? "var(--app-brand-press)" : "var(--app-ink-3)" }}
        >
          {live && (
            <span aria-hidden className="live-dot h-1 w-1 rounded-full" style={{ background: "var(--app-brand)" }} />
          )}
          {chip.kicker}
        </span>
        <span className="block truncate font-serif text-[14px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
          {chip.title}
        </span>
        {chip.meta && (
          <span className="block truncate text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {chip.meta}
          </span>
        )}
      </span>
    </Link>
  );
}
