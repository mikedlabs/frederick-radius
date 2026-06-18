import Link from "next/link";
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
 * slots in a wallet where they overlap nicely." So each live pour is a high-end
 * paper card in the /happy-hour "Last Pour" voice — a left gold rail welding
 * the deal HOOK (set big in gold mono) to the serif venue name, the verified
 * specials beneath, a live "till X" tab — and the cards overlap vertically like
 * loyalty cards in Apple Wallet: every card peeks its top (town · venue · hook ·
 * status), and the most urgent pour (last call, then ending soonest) sits FULL
 * and lifted at the front. Tap any card to that place; "All pours" opens the
 * full guide.
 *
 * Honest + self-hiding: drawn straight from the verified Field Notes moat,
 * filtered to windows that include right now (Eastern). Renders nothing when
 * none are live (mornings, late night), so it only ever shows a real, current
 * happy hour. Server component.
 */

const PEEK_CAP = 5; // featured (full) + up to 4 peeking behind it

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

      {/* The wallet. Cards overlap upward; each peeks its top strip, the front
          (last) card sits full + lifted. */}
      <div>
        {shown.map((pour, i) => {
          const front = i === shown.length - 1;
          const back = !front;
          const accent = pour.lastCall ? "var(--app-brand)" : "var(--app-accent)";
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
                // Overlap every card after the first so each back card peeks
                // exactly its header (town · status · venue · gold hook), the
                // specials tucked behind the card in front — like cards in a
                // wallet. The specials block reserves a uniform 2 lines, so
                // back-card heights match and the peeks line up; the front
                // card is unclipped and shows the full pour.
                marginTop: i === 0 ? 0 : "-52px",
                paddingTop: "11px",
                paddingBottom: "12px",
                zIndex: i + 1,
                // SOLID paper base — the cards overlap, so each must fully
                // occlude the one behind (the translucent --app-bg-elevated
                // would let the back card's text bleed through). The grain
                // rides as a separate image layer (--app-paper-light is itself
                // a gradient, so it can't be nested inside another one).
                backgroundColor: "var(--app-bg-elevated-solid)",
                backgroundImage: "var(--app-paper-light)",
                boxShadow: front
                  ? "var(--app-elev-2), var(--app-hi), var(--app-edge)"
                  : "var(--app-elev-1), var(--app-hi), var(--app-edge)",
              }}
            >
              {/* Left rail — the deal welded to the venue, the moat's signature. */}
              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
              {/* A whisper of the accent recedes the back cards behind the front. */}
              {back && <span aria-hidden className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--app-ink) 4%, transparent)" }} />}

              {/* Peek strip: town + live status tab. */}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
                  {pour.town ?? "Frederick County"}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: pour.lastCall ? "var(--app-brand-press)" : "var(--app-accent-press)" }}>
                  <span aria-hidden className="live-dot h-1 w-1 rounded-full" style={{ background: accent }} />
                  {tab}
                </span>
              </div>

              {/* Venue + the gold hook hero. */}
              <h3 className="mt-1 truncate font-serif text-[19px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
                {pour.name}
              </h3>
              <p className="mt-0.5 font-mono font-bold leading-none tracking-[-0.01em]" style={{ fontSize: pour.hook ? "27px" : "20px", color: "var(--app-accent-press)" }}>
                {pour.hook ?? "Specials"}
              </p>

              {/* The verified specifics (the moat) — reserved at 2 lines so the
                  peeks above stay uniform. */}
              {pour.specials && (
                <p className="mt-1.5 font-serif text-[13px] italic leading-snug" style={{ color: "var(--app-ink-2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.7em" }}>
                  {pour.specials}
                </p>
              )}
              {front && pour.verified && (
                <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                  {pour.verified}
                </p>
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
