import Link from "next/link";
import Image from "next/image";
import { Star, Martini } from "lucide-react";
import { placesWithFieldHappyHour } from "@/lib/loaders/fieldNotes";
// eslint-disable-next-line no-restricted-imports -- SERVER component (no "use client"): loader imports render server-side and never enter the client bundle
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { parseHappyHour, type HHWindow } from "@/lib/happyHour";
import { isClosedNow } from "@/lib/hours";
import { dealQuality } from "@/lib/happyHourDeal";
import DealLines from "@/components/happy/DealLines";

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
  deal: string;
  endsAt: number; // Eastern minutes; 1440 = close
  lastCall: boolean;
};

type NextPour = { slug: string; name: string; deal: string; label: string };

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
  // The full deal (subject + figure), not a bare hook — so the teaser reads
  // "Opens 5 PM · 50% off all wine bottles", never "Opens 5 PM · 50% OFF".
  return { slug: best.slug, name: p.name, deal: best.details, label };
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
    // Suppress the live pour when the venue is provably closed now (DQ-019).
    if (isClosedNow(p.hours, p.hours_verified ?? false, now)) continue;
    pours.push({
      slug: v.slug,
      name: p.name,
      town: p.municipality ? (MUNICIPALITY_BY_SLUG[p.municipality]?.name ?? undefined) : undefined,
      photo: p.google_photo_url,
      rating: p.google_rating,
      deal: v.happy_hour.details || "",
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
              {next.deal && <span>{"  ·  "}{next.deal}</span>}
            </p>
          </div>
        </Link>
      </section>
    );
  }

  // Deal QUALITY leads (a clear figure beats a vague "specials" entry no matter
  // how soon it ends), then last-call urgency, then ending soonest. So the top
  // card is always a clear, actionable deal, never a figureless one.
  const score = (p: LivePour) => dealQuality(p.deal) * 1e6 + (p.lastCall ? 1e5 : 0) + (1440 - p.endsAt);
  pours.sort((a, b) => score(b) - score(a));
  const shown = pours.slice(0, SHOW_CAP);
  const overflow = pours.length - shown.length;
  const n = pours.length;

  return (
    <section aria-labelledby="hh-wallet-eyebrow" className="space-y-2.5">
      {/* LIVE masthead — this is the most time-urgent thing on the page, so it
          leads with a confident serif title + a pulsing vermilion ON-NOW line.
          A deliberately different identity from Today's specials' calm spruce
          verified-seal dossier below: vermilion live language = "act before it
          ends," so the "now" section reads as the priority. */}
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2 id="hh-wallet-eyebrow" className="font-serif text-[19px] font-semibold leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
            Happy hour
          </h2>
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
            <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
            On now · {n} {n === 1 ? "pour" : "pours"} pouring
          </p>
        </div>
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
                aria-label={`${pour.name}${pour.deal ? `: ${pour.deal}` : ""}. Happy hour ${tab.toLowerCase()}`}
                className="tactile-interactive relative flex items-center gap-3 overflow-hidden rounded-[var(--app-radius-md)] py-2.5 pl-3 pr-2.5"
                style={{
                  backgroundColor: "var(--app-bg-elevated-solid)",
                  backgroundImage: "var(--app-paper-light)",
                  boxShadow: "var(--app-elev-1), var(--app-hi), var(--app-edge)",
                }}
              >
                {/* Vermilion live edge — the at-a-glance "this is happening now"
                    cue that sets the live board apart from the briefing dossier. */}
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: pour.lastCall ? "var(--app-brand-press)" : "var(--app-brand)" }} />

                {/* Photo thumbnail — text stays on paper beside it (readable). */}
                <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[var(--app-radius-sm)]" style={{ backgroundColor: "var(--app-brand-2)" }}>
                  {pour.photo ? (
                    <Image
                      src={pour.photo}
                      alt=""
                      fill
                      unoptimized={pour.photo.startsWith("/api/place-photo")}
                      sizes="72px"
                      className="object-cover"
                    />
                  ) : (
                    <PhotoFallback />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* Live timing leads — the urgent fact ("till 7 PM"), in
                      vermilion, as a small badge so it reads before the deal. */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em]"
                      style={{
                        background: `color-mix(in srgb, ${pour.lastCall ? "var(--app-brand-press)" : "var(--app-brand)"} 12%, transparent)`,
                        color: pour.lastCall ? "var(--app-brand-press)" : "var(--app-brand-press)",
                      }}
                    >
                      <span aria-hidden className="live-dot h-1 w-1 rounded-full" style={{ background: "currentColor" }} />
                      {tab}
                    </span>
                    {pour.rating != null && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                        <Star className="h-3 w-3" strokeWidth={0} fill="var(--app-accent-press)" aria-hidden />
                        {pour.rating.toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* Venue + town. */}
                  <h3 className="truncate font-serif text-[16px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
                    {pour.name}
                    {pour.town ? <span className="font-sans text-[12px] font-normal" style={{ color: "var(--app-ink-3)" }}>{"  ·  "}{pour.town}</span> : null}
                  </h3>

                  {/* The deal: each discount on its own line, figure glued to
                      what it's for (never a bare number). */}
                  {pour.deal ? (
                    <DealLines deal={pour.deal} max={2} vague={dealQuality(pour.deal) === 0} className="space-y-0.5 text-[12.5px]" />
                  ) : (
                    <p className="text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>Specials</p>
                  )}
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
