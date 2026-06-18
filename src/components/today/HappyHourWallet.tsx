import Link from "next/link";
import Image from "next/image";
import { Martini, BadgeCheck } from "lucide-react";
import { placesWithFieldHappyHour, fieldNotesFor, verifiedLabel } from "@/lib/loaders/fieldNotes";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { parseHappyHour, type HHWindow } from "@/lib/happyHour";
import { splitDeal } from "@/lib/happyHourDeal";

/**
 * HappyHourWallet — the happy hours ON NOW, on /today, as a stack of cards
 * tucked in a wallet.
 *
 * Owner ask: "all the happy hours designed like the Shuckin Shack… inside card
 * slots in a wallet where they overlap nicely" + "make the cards a better design
 * and more visual." So each live pour is now the /happy-hour "Last Pour" COVER
 * shrunk into a wallet card: a full-bleed venue PHOTO under an ink scrim, the
 * serif venue name reversed out, the deal HOOK set big in bright gold, a live
 * status pill, and (on the open front card) the verified specials + a stamped
 * verified seal. The cards overlap vertically like loyalty cards in Apple
 * Wallet: every back card peeks its top band (town · venue · hook · status),
 * and the most urgent pour (last call, then ending soonest) sits FULL + lifted
 * at the front. Tap any card to that place; "All pours" opens the full guide.
 *
 * Direction picked by a 4-way design panel ("The Pour Stack") + grafts: the
 * status-pill placement and the wax-seal verified mark. Honest + self-hiding:
 * drawn from the verified Field Notes moat, filtered to windows that include
 * right now (Eastern); renders nothing in the morning / late night. Server
 * component.
 */

const PEEK_CAP = 5; // featured (full) + up to 4 peeking behind it
const CARD_H = 168; // px — every card shares this geometry so peeks line up
const OVERLAP = 80; // px pulled up → ~88px peek = the whole top band

/** Eastern {day 0-6, minutes-since-midnight} for the supplied instant. */
function easternParts(now: Date): { day: number; min: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: wd[get("weekday")] ?? 0, min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

function fmtMin(m: number): string {
  if (m >= 1440) return "close";
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${mer}` : `${h12}:${String(mm).padStart(2, "0")} ${mer}`;
}

/** The Cover's photo-less fallback: a warm spruce-to-gold wash + a Martini. */
function PhotoFallback() {
  return (
    <div
      aria-hidden
      className="grid h-full w-full place-items-center"
      style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--app-accent) 30%, var(--app-brand-2)) 0%, var(--app-brand-2) 72%)" }}
    >
      <Martini className="h-9 w-9" strokeWidth={1.5} style={{ color: "color-mix(in srgb, var(--app-accent) 60%, var(--app-on-brand))" }} />
    </div>
  );
}

type LivePour = {
  slug: string;
  name: string;
  town?: string;
  photo?: string;
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
      photo: p.google_photo_url,
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

      {/* The wallet. Photo cards overlap upward; each peeks its top band, the
          front (last) card sits full + lifted, revealing the bottom band. */}
      <div>
        {shown.map((pour, i) => {
          const front = i === shown.length - 1;
          const back = !front;
          const tab = pour.lastCall
            ? `Last call · till ${fmtMin(pour.endsAt)}`
            : pour.endsAt >= 1440 ? "On now · till close" : `On now · till ${fmtMin(pour.endsAt)}`;
          return (
            <Link
              key={pour.slug}
              href={`/places/${pour.slug}`}
              aria-label={`${pour.name}${pour.hook ? `: ${pour.hook}` : ""}. Happy hour ${tab.toLowerCase()}`}
              className="tactile-interactive relative block overflow-hidden rounded-[var(--app-radius-md)]"
              style={{
                height: CARD_H,
                marginTop: i === 0 ? 0 : -OVERLAP,
                zIndex: i + 1,
                // Opaque spruce plate UNDER the photo so the card occludes the
                // one behind it from frame one (before the image paints / behind
                // any alpha) — the wallet's occlusion guarantee.
                backgroundColor: "var(--app-brand-2)",
                boxShadow: front ? "var(--app-elev-2), var(--app-hi)" : "var(--app-elev-1)",
              }}
            >
              {/* Layer 0 — the venue photo (or the Cover's gradient fallback). */}
              {pour.photo ? (
                <Image src={pour.photo} alt="" fill sizes="(max-width: 640px) 100vw, 520px" className="object-cover" />
              ) : (
                <PhotoFallback />
              )}

              {/* Layer 1 — two scrims: a TOP band for the always-visible peek
                  header, a BOTTOM plate for the front card's detail. Load-bearing
                  for AA; never lighten. */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, color-mix(in srgb, var(--app-ink) 82%, transparent) 0%, color-mix(in srgb, var(--app-ink) 46%, transparent) 30%, transparent 56%), linear-gradient(to top, color-mix(in srgb, var(--app-ink) 90%, transparent) 0%, color-mix(in srgb, var(--app-ink) 55%, transparent) 30%, transparent 60%)",
                }}
              />
              {/* Recede the back cards so the front pops (photos are busier than
                  paper, so this is deeper than a paper stack would need). */}
              {back && <div aria-hidden className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--app-ink) 22%, transparent)" }} />}

              {/* Layer 2 — TOP BAND (always visible, even when peeking). */}
              <div className="absolute inset-x-0 top-0 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "color-mix(in srgb, var(--app-accent) 55%, var(--app-on-brand))" }}>
                    {pour.town ?? "Frederick County"}
                  </span>
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em]"
                    style={{ background: pour.lastCall ? "var(--app-brand)" : "var(--app-accent-press)", color: "var(--app-on-brand)" }}
                  >
                    <span aria-hidden className="live-dot h-1 w-1 rounded-full" style={{ background: "var(--app-on-brand)" }} />
                    {tab}
                  </span>
                </div>
                <h3 className="mt-1 truncate font-serif text-[19px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-on-brand)" }}>
                  {pour.name}
                </h3>
                <p
                  className="mt-0.5 font-mono font-bold leading-none tracking-[-0.01em]"
                  style={{ fontSize: pour.hook ? "28px" : "19px", color: "color-mix(in srgb, var(--app-accent) 70%, var(--app-on-brand))" }}
                >
                  {pour.hook ?? "Specials"}
                </p>
              </div>

              {/* Layer 3 — BOTTOM BAND (front card only): the verified specials
                  + a stamped verified seal. */}
              {front && (
                <div className="absolute inset-x-0 bottom-0 p-3.5">
                  {pour.specials && (
                    <p className="line-clamp-2 max-w-prose font-serif text-[13px] italic leading-snug" style={{ color: "color-mix(in srgb, var(--app-on-brand) 92%, transparent)" }}>
                      &ldquo;{pour.specials}&rdquo;
                    </p>
                  )}
                  {pour.verified && (
                    <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em]" style={{ color: "color-mix(in srgb, var(--app-on-brand) 64%, transparent)" }}>
                      <span
                        aria-hidden
                        className="grid h-[18px] w-[18px] place-items-center rounded-full"
                        style={{ background: "color-mix(in srgb, var(--app-on-brand) 20%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-on-brand) 38%, transparent)" }}
                      >
                        <BadgeCheck className="h-3 w-3" strokeWidth={2} style={{ color: "var(--app-on-brand)" }} />
                      </span>
                      {pour.verified}
                    </p>
                  )}
                </div>
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
