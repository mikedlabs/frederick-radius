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
 * Owner asks, in order: "inside card slots in a wallet where they overlap
 * nicely" -> "more visual" -> "make sure the cards are readable. make them
 * look like gift cards with raised numbers." So each live pour is now a calm
 * GIFT-CARD on warm paper stock (not a dark photo): the venue in serif ink, a
 * live status pill, and the deal HOOK struck as a RAISED (embossed) gold number
 * — a top-light / bottom-shade text-shadow so the figure reads as pressed up
 * out of the card stock, the way digits are embossed on a real gift card. The
 * cards still overlap like a wallet (each back card peeks its top band; the
 * most urgent pour sits full + lifted at the front), but they're opaque paper,
 * so they occlude cleanly and the text is dark-on-cream (no scrim, AA by
 * default). The dark full-bleed photo treatment was retired here — photos fight
 * the calm field guide and the legibility depended on heavy ink scrims.
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

/** Scale the gold hook to its length so a short punch ("$5") reads big while a
 *  long one ("FROM $3.50", "$1 OYSTERS") stays proportionate and never dwarfs
 *  the venue name. */
function hookFontSize(hook: string | null): string {
  if (!hook) return "19px"; // "Specials"
  const n = hook.length;
  if (n <= 5) return "28px";
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

      {/* The wallet. Gift-card stock overlaps upward; each card peeks its top
          band (town · venue · raised number), the front (last) card sits full +
          lifted, revealing the specials + verified seal. */}
      <div>
        {shown.map((pour, i) => {
          const front = i === shown.length - 1;
          const tab = pour.lastCall
            ? `Last call · till ${fmtMin(pour.endsAt)}`
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
                paddingTop: "12px",
                paddingBottom: "12px",
                zIndex: i + 1,
                // Opaque warm card stock + grain — the cards overlap, so each
                // must fully occlude the one behind it (paper-light is a
                // gradient, applied as its own layer, never nested).
                backgroundColor: "var(--app-bg-elevated-solid)",
                backgroundImage: "var(--app-paper-light)",
                boxShadow: front
                  ? "var(--app-elev-2), var(--app-hi), var(--app-edge)"
                  : "var(--app-elev-1), var(--app-hi), var(--app-edge)",
              }}
            >
              {/* Left rail — vermilion at last call, spruce otherwise. */}
              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: pour.lastCall ? "var(--app-brand)" : "var(--app-brand-2)" }} />

              {/* Top band (always visible, even when peeking): town + status. */}
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
                  {pour.town ?? "Frederick County"}
                </span>
                {pour.lastCall ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em]" style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}>
                    <span aria-hidden className="live-dot h-1 w-1 rounded-full" style={{ background: "var(--app-on-brand)" }} />
                    {tab}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em]" style={{ background: "color-mix(in srgb, var(--app-accent) 16%, transparent)", color: "var(--app-accent-press)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 32%, transparent)" }}>
                    <span aria-hidden className="live-dot h-1 w-1 rounded-full" style={{ background: "var(--app-accent-press)" }} />
                    {tab}
                  </span>
                )}
              </div>

              {/* Venue name + the RAISED gold number (the gift-card emboss). */}
              <h3 className="mt-1 truncate font-serif text-[18px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
                {pour.name}
              </h3>
              <p
                className="mt-0.5 font-mono font-bold leading-none tracking-[-0.01em]"
                style={{ fontSize: hookFontSize(pour.hook), color: "var(--app-accent-press)", textShadow: RAISED }}
              >
                {pour.hook ?? "Specials"}
              </p>

              {/* Front card only: the verified specials + a stamped seal. */}
              {front && (
                <>
                  {pour.specials && (
                    <p className="mt-2 line-clamp-2 max-w-prose font-serif text-[13px] italic leading-snug" style={{ color: "var(--app-ink-2)" }}>
                      &ldquo;{pour.specials}&rdquo;
                    </p>
                  )}
                  {pour.verified && (
                    <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                      <span
                        aria-hidden
                        className="grid h-[18px] w-[18px] place-items-center rounded-full"
                        style={{ background: "color-mix(in srgb, var(--app-brand-2) 12%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-brand-2) 30%, transparent)" }}
                      >
                        <BadgeCheck className="h-3 w-3" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} />
                      </span>
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
