import Link from "next/link";
import Image from "next/image";
import { Star, BadgeCheck, Martini } from "lucide-react";
import { placesWithFieldHappyHour } from "@/lib/loaders/fieldNotes";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { parseHappyHour, type HHWindow } from "@/lib/happyHour";
import { splitDeal } from "@/lib/happyHourDeal";

/**
 * HappyHourWallet — the happy hours ON NOW, on /today.
 *
 * Owner arc landed here: fuller, more VISUAL, more DETAILED cards. Each live
 * pour is a rich card — a venue PHOTO thumbnail (readable, on the side, never a
 * dark full-bleed scrim), the serif venue name + its Google rating, the deal
 * (gold hook + what you actually get), and a verified status line (when it
 * runs till + the town). Shown as a clean list of full cards (the tight wallet
 * overlap hid too much detail), most urgent first, capped with a "+N more" door
 * to the full guide.
 *
 * Honest + self-hiding: drawn from the verified Field Notes moat, filtered to
 * windows that include right now (Eastern). Server component.
 */

const SHOW_CAP = 5;

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

/** The Cover's photo-less fallback, sized for a thumbnail. */
function PhotoFallback() {
  return (
    <div aria-hidden className="grid h-full w-full place-items-center" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--app-accent) 30%, var(--app-brand-2)) 0%, var(--app-brand-2) 72%)" }}>
      <Martini className="h-5 w-5" strokeWidth={1.5} style={{ color: "color-mix(in srgb, var(--app-accent) 60%, var(--app-on-brand))" }} />
    </div>
  );
}

type LivePour = {
  slug: string;
  name: string;
  town?: string;
  photo?: string;
  rating?: number;
  hook: string | null;
  rest: string;
  endsAt: number; // Eastern minutes; 1440 = close
  lastCall: boolean;
};

type NextPour = { slug: string; name: string; hook: string | null; label: string };

/**
 * The soonest verified pour starting AFTER now (Eastern), across every venue.
 * Powers the "between rounds" state so the wedge surfaces the next happy hour
 * instead of vanishing in the gaps (evenings, mornings, the dead hour before a
 * late-night window). Self-hides only when nothing is scheduled at all.
 */
function nextPour(now: Date): NextPour | null {
  const { day, min } = easternParts(now);
  let best: { mins: number; slug: string; dayOffset: number; start: number; details: string } | null = null;
  for (const v of placesWithFieldHappyHour()) {
    for (const w of parseHappyHour(v.happy_hour.schedule)) {
      for (const d of w.days) {
        let dayOffset = (d - day + 7) % 7;
        if (dayOffset === 0 && w.start <= min) dayOffset = 7; // already started today → next week
        const mins = dayOffset * 1440 + w.start - min;
        if (mins <= 0) continue;
        if (!best || mins < best.mins) {
          best = { mins, slug: v.slug, dayOffset, start: w.start, details: v.happy_hour.details ?? "" };
        }
      }
    }
  }
  if (!best) return null;
  const p = clientPlaceBySlug(best.slug);
  if (!p) return null;
  const time = fmtMin(best.start);
  const label =
    best.dayOffset === 0
      ? `Opens ${time}`
      : best.dayOffset === 1
        ? `Opens tomorrow ${time}`
        : `Opens ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(now.getTime() + best.dayOffset * 86_400_000))} ${time}`;
  return { slug: best.slug, name: p.name, hook: splitDeal(best.details).hook, label };
}

export default function HappyHourWallet({ now }: { now: Date }) {
  const { day, min } = easternParts(now);

  const pours: LivePour[] = [];
  for (const v of placesWithFieldHappyHour()) {
    const windows = parseHappyHour(v.happy_hour.schedule);
    const live = windows.find((w: HHWindow) => w.days.includes(day) && min >= w.start && min < w.end);
    if (!live) continue;
    const p = clientPlaceBySlug(v.slug);
    if (!p) continue;
    const { hook, rest } = splitDeal(v.happy_hour.details);
    pours.push({
      slug: v.slug,
      name: p.name,
      town: p.municipality ? (MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? undefined) : undefined,
      photo: p.google_photo_url,
      rating: p.google_rating,
      hook,
      rest: rest || v.happy_hour.details || "",
      endsAt: live.end,
      lastCall: live.end < 1440 && live.end - min <= 30,
    });
  }
  if (pours.length === 0) {
    // Between rounds: surface the NEXT verified pour rather than vanish, so the
    // wedge stays present + useful. Returns null only if nothing is scheduled.
    const next = nextPour(now);
    if (!next) return null;
    return (
      <section aria-labelledby="hh-wallet-eyebrow" className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="hh-wallet-eyebrow" className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-2)" }}>
            Happy hour
          </h2>
          <Link href="/happy-hour" className="tap-44 shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-accent-press)" }}>
            All pours →
          </Link>
        </div>
        <Link
          href={`/places/${next.slug}`}
          aria-label={`No happy hour on right now. Next: ${next.name}, ${next.label.toLowerCase()}`}
          className="tactile-interactive flex items-center gap-3 overflow-hidden rounded-[var(--app-radius-md)] p-2.5"
          style={{
            backgroundColor: "var(--app-bg-elevated-solid)",
            backgroundImage: "var(--app-paper-light)",
            boxShadow: "var(--app-elev-1), var(--app-hi), var(--app-edge)",
          }}
        >
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[var(--app-radius-sm)]" style={{ background: "color-mix(in srgb, var(--app-brand-2) 12%, var(--app-bg-sunken))" }}>
            <Martini className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--app-brand-2)" }} aria-hidden />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
              Between rounds
            </p>
            <h3 className="truncate font-serif text-[16px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
              {next.name}
            </h3>
            <p className="truncate text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              <span className="font-mono font-bold uppercase tracking-[0.06em]" style={{ color: "var(--app-accent-press)" }}>{next.label}</span>
              {next.hook && <span>{"  ·  "}{next.hook}</span>}
            </p>
          </div>
        </Link>
      </section>
    );
  }

  // Most urgent first (last call, then ending soonest) — it's a list now, so
  // the top card is the one to act on.
  pours.sort((a, b) => {
    const ua = (a.lastCall ? 1e6 : 0) + (1440 - a.endsAt);
    const ub = (b.lastCall ? 1e6 : 0) + (1440 - b.endsAt);
    return ub - ua;
  });
  const shown = pours.slice(0, SHOW_CAP);
  const overflow = pours.length - shown.length;
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

      {/* Rich photo cards — each shows the venue, rating, the full deal, and a
          verified status line. */}
      <ul className="space-y-2">
        {shown.map((pour) => {
          const tab = pour.lastCall
            ? `Last call · till ${fmtMin(pour.endsAt)}`
            : pour.endsAt >= 1440 ? "On now · till close" : `On now · till ${fmtMin(pour.endsAt)}`;
          return (
            <li key={pour.slug}>
              <Link
                href={`/places/${pour.slug}`}
                aria-label={`${pour.name}${pour.hook ? `: ${pour.hook}` : ""}. Happy hour ${tab.toLowerCase()}`}
                className="tactile-interactive flex items-center gap-3 overflow-hidden rounded-[var(--app-radius-md)] p-2.5"
                style={{
                  backgroundColor: "var(--app-bg-elevated-solid)",
                  backgroundImage: "var(--app-paper-light)",
                  boxShadow: "var(--app-elev-1), var(--app-hi), var(--app-edge)",
                }}
              >
                {/* Photo thumbnail — text stays on paper beside it (readable). */}
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--app-radius-sm)]" style={{ backgroundColor: "var(--app-brand-2)" }}>
                  {pour.photo ? (
                    <Image src={pour.photo} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <PhotoFallback />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {/* Venue + rating. */}
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="min-w-0 flex-1 truncate font-serif text-[16px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
                      {pour.name}
                    </h3>
                    {pour.rating != null && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                        <Star className="h-3 w-3" strokeWidth={0} fill="var(--app-accent-press)" aria-hidden />
                        {pour.rating.toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* The deal: gold hook + what you actually get. */}
                  <p className="truncate text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                    <span className="font-mono font-bold" style={{ color: "var(--app-accent-press)" }}>{pour.hook ?? "Specials"}</span>
                    {pour.rest && pour.rest !== pour.hook && <span>{"  ·  "}{pour.rest}</span>}
                  </p>

                  {/* Verified status line: when it runs till + the town. */}
                  <p className="flex items-center gap-1.5 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: pour.lastCall ? "var(--app-brand-press)" : "var(--app-ink-3)" }}>
                    <BadgeCheck className="h-3 w-3 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} aria-hidden />
                    <span className="truncate">{tab}{pour.town ? `  ·  ${pour.town}` : ""}</span>
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {overflow > 0 && (
        <Link href="/happy-hour" className="tap-44 block text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          +{overflow} more pouring now →
        </Link>
      )}
    </section>
  );
}
