import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { placesWithFieldHappyHour, fieldNotesFor, verifiedLabel } from "@/lib/loaders/fieldNotes";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { parseHappyHour, type HHWindow } from "@/lib/happyHour";
import { splitDeal } from "@/lib/happyHourDeal";

/**
 * HappyHourWallet — the happy hours ON NOW, on /today, as a stack of cards
 * tucked in a wallet.
 *
 * Owner arc: "wallet where they overlap nicely" -> "more visual" -> "gift cards
 * with raised numbers" -> "more style AND cleaner." So each live pour is now a
 * DENOMINATION gift card: a top brand stripe (urgency, not a per-venue
 * rainbow), a small EMV-chip motif as the one made-object flourish, the deal
 * HOOK struck as a big RAISED gold denomination (top-light/bottom-shade emboss,
 * like a figure pressed into card stock), the venue as the "cardholder" line,
 * and the status reduced to quiet mono text. Subtraction over chrome: gone are
 * the left rail, both filled status pills, and the circular verified badge.
 * The cards still overlap like a wallet (each back card peeks its top band, the
 * most urgent pour sits full + lifted at the front) and stay opaque paper so
 * they occlude cleanly and read dark-on-cream (AA by default).
 *
 * Honest + self-hiding: drawn from the verified Field Notes moat, filtered to
 * windows that include right now (Eastern). Server component.
 */

const PEEK_CAP = 5; // featured (full) + up to 4 peeking behind it
const CARD_H = 156; // px — every card shares this geometry so peeks line up
const OVERLAP = 70; // px pulled up → ~86px peek = the whole top band

/** A struck/raised number: a light top edge + a soft shadow below, so the gold
 *  figure reads as embossed out of the cream stock (the gift-card feel). */
const RAISED =
  "0 -1px 0 color-mix(in srgb, var(--app-on-brand) 70%, transparent), 0 1px 1px color-mix(in srgb, var(--app-ink) 26%, transparent)";

/** Eastern {day 0-6, minutes-since-midnight} for the supplied instant. */
function easternParts(now: Date): { day: number; min: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: wd[get("weekday")] ?? 0, min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/** The denomination size — a short punch ("$5") strikes big, a long hook
 *  ("FROM $3.50", "$1 OYSTERS") stays in a smaller bucket so it never wraps or
 *  dwarfs the serif venue within the ~290px card. */
function hookFontSize(hook: string | null): string {
  if (!hook) return "18px"; // "Specials"
  const n = hook.length;
  if (n <= 4) return "32px";
  if (n <= 6) return "27px";
  if (n <= 9) return "22px";
  return "18px";
}

function fmtMin(m: number): string {
  if (m >= 1440) return "close";
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${mer}` : `${h12}:${String(mm).padStart(2, "0")} ${mer}`;
}

/** The EMV-chip motif — the one gift-card "tell." A small warm-gold foil pad
 *  (pressed via edge + highlight) holding the classic contact grid. */
function Chip() {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[4px]"
      style={{ width: "26px", height: "18px", background: "color-mix(in srgb, var(--app-accent) 22%, var(--app-bg-elevated-solid))", boxShadow: "var(--app-edge), var(--app-hi)" }}
    >
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="color-mix(in srgb, var(--app-accent-press) 55%, transparent)" strokeWidth="1">
        <rect x="0.5" y="0.5" width="15" height="10" rx="1.5" />
        <line x1="0.5" y1="5.5" x2="15.5" y2="5.5" />
        <line x1="5.5" y1="0.5" x2="5.5" y2="10.5" />
        <line x1="10.5" y1="0.5" x2="10.5" y2="10.5" />
      </svg>
    </span>
  );
}

type LivePour = {
  slug: string;
  name: string;
  town?: string;
  hook: string | null;
  specials: string;
  verified?: string;
  endsAt: number; // Eastern minutes; 1440 = close
  lastCall: boolean;
};

export default function HappyHourWallet({ now }: { now: Date }) {
  const { day, min } = easternParts(now);

  const pours: LivePour[] = [];
  for (const v of placesWithFieldHappyHour()) {
    const windows = parseHappyHour(v.happy_hour.schedule);
    const live = windows.find((w: HHWindow) => w.days.includes(day) && min >= w.start && min < w.end);
    if (!live) continue;
    const p = clientPlaceBySlug(v.slug);
    if (!p) continue;
    const fn = fieldNotesFor(v.slug);
    const { hook } = splitDeal(v.happy_hour.details);
    pours.push({
      slug: v.slug,
      name: p.name,
      town: p.municipality ? (MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? undefined) : undefined,
      hook,
      specials: v.happy_hour.details || "",
      verified: fn?.happy_hour ? (verifiedLabel(v.happy_hour.last_verified) ?? undefined) : undefined,
      endsAt: live.end,
      lastCall: live.end < 1440 && live.end - min <= 30,
    });
  }
  if (pours.length === 0) return null;

  // Urgency ascending → the most urgent pour lands LAST in the DOM, so it
  // paints on top (the full, lifted front card). Last call beats ending-soonest.
  pours.sort((a, b) => {
    const ua = (a.lastCall ? 1e6 : 0) + (1440 - a.endsAt);
    const ub = (b.lastCall ? 1e6 : 0) + (1440 - b.endsAt);
    return ua - ub;
  });
  const overflow = Math.max(0, pours.length - PEEK_CAP);
  const shown = overflow > 0 ? pours.slice(pours.length - PEEK_CAP) : pours;
  const n = pours.length;

  return (
    <section aria-labelledby="hh-wallet-eyebrow" className="space-y-2">
      {/* Eyebrow: a live dot + the count, with the door to the full guide. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="hh-wallet-eyebrow" className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-2)" }}>
          <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
          Happy hour now
          <span className="tabular-nums" style={{ color: "var(--app-ink-3)" }}>{n}</span>
        </h2>
        <Link href="/happy-hour" className="tap-44 shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-accent-press)" }}>
          All pours →
        </Link>
      </div>

      {/* The wallet — denomination gift cards overlapping upward; each peeks its
          chip + town + status + venue + the big embossed figure, the front
          (last) card sits full + lifted, revealing the specials + verified. */}
      <div>
        {shown.map((pour, i) => {
          const front = i === shown.length - 1;
          const tab = pour.lastCall
            ? `Last call · ${fmtMin(pour.endsAt)}`
            : pour.endsAt >= 1440 ? "On now · till close" : `On now · till ${fmtMin(pour.endsAt)}`;
          return (
            <Link
              key={pour.slug}
              href={`/places/${pour.slug}`}
              aria-label={`${pour.name}${pour.hook ? `: ${pour.hook}` : ""}. Happy hour ${tab.toLowerCase()}`}
              className="tactile-interactive relative block overflow-hidden rounded-[var(--app-radius-md)] pl-4 pr-3.5"
              style={{
                height: CARD_H,
                marginTop: i === 0 ? 0 : -OVERLAP,
                paddingTop: "13px",
                paddingBottom: "12px",
                zIndex: i + 1,
                backgroundColor: "var(--app-bg-elevated-solid)",
                backgroundImage: "var(--app-paper-light)",
                boxShadow: front
                  ? "var(--app-elev-2), var(--app-hi), var(--app-edge)"
                  : "var(--app-elev-1), var(--app-hi), var(--app-edge)",
              }}
            >
              {/* Brand stripe — the gift-card top edge; urgency, never gold,
                  never per-venue (clipped to the rounded-top by overflow-hidden). */}
              <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: pour.lastCall ? "var(--app-brand)" : "var(--app-brand-2)" }} />

              {/* Row A: EMV chip · town · status (quiet mono, no pill). */}
              <div className="flex items-center gap-2">
                <Chip />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
                  {pour.town ?? "Frederick County"}
                </span>
                <span
                  className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] tabular-nums"
                  style={{ color: pour.lastCall ? "var(--app-brand-press)" : "var(--app-ink-3)" }}
                >
                  <span aria-hidden className="live-dot h-1 w-1 rounded-full" style={{ background: pour.lastCall ? "var(--app-brand)" : "var(--app-brand-2)" }} />
                  {tab}
                </span>
              </div>

              {/* Cardholder line = venue, then the big raised gold denomination. */}
              <h3 className="mt-1.5 truncate font-serif text-[17px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
                {pour.name}
              </h3>
              <p
                className="mt-0.5 font-mono font-bold leading-none tracking-[-0.01em]"
                style={
                  pour.hook
                    ? { fontSize: hookFontSize(pour.hook), color: "var(--app-accent-press)", textShadow: RAISED }
                    : { fontSize: "18px", color: "var(--app-ink-2)" }
                }
              >
                {pour.hook ?? "Specials"}
              </p>

              {/* Front card only: the verified specials + a flat foil seal line. */}
              {front && (
                <>
                  {pour.specials && (
                    <p className="mt-2 line-clamp-2 max-w-prose font-serif text-[13px] italic leading-snug" style={{ color: "var(--app-ink-2)" }}>
                      &ldquo;{pour.specials}&rdquo;
                    </p>
                  )}
                  {pour.verified && (
                    <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                      <BadgeCheck className="h-3 w-3 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} aria-hidden />
                      {pour.verified}
                    </p>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </div>

      {overflow > 0 && (
        <Link href="/happy-hour" className="tap-44 block text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          +{overflow} more pouring now →
        </Link>
      )}
    </section>
  );
}
