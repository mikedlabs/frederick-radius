import Link from "next/link";
import { Ticket, ChevronRight } from "lucide-react";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes } from "@/lib/sun";
import { eventWhenLabel } from "@/lib/eventWhenLabel";
import { isActivelyWet, mentionsWet } from "@/lib/weather-verdict";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";
import LiveClock from "./LiveClock";

/**
 * TodayCard — the daily hook at the very top of /now.
 *
 * The product thesis is "less list, more lens": within a few seconds a
 * stranger should get a win and understand why this app exists. This
 * card is that moment. It turns the data the page already has — weather
 * now, today's high, sunset, and tonight's headline event — into one
 * editorial readout plus two situational next-steps, instead of making
 * the user assemble it from scattered modules.
 *
 *   Frederick today
 *   Good morning. Patio weather.
 *   70° now · High 76° · Sunset 8:27 PM
 *   Tonight: Alive @ Five at Carroll Creek
 *   [ Find coffee → ]  [ Open map ]
 *
 * Renders ON the SkyHero gradient (tone-aware via currentColor), so it
 * IS the hero rather than a card stacked on top of one. Server
 * component; the NWS fetch is shared/cached with the rest of the page.
 */

type TonightEvent = {
  slug: string;
  title: string;
  venue_name?: string | null;
  /** ISO start — so the line labels by the event's REAL day (Tonight /
   *  Tomorrow / Friday), never just by the current time-of-day band. */
  starts_at: string;
} | null;

type Band = "morning" | "midday" | "afternoon" | "evening" | "late";

function easternHour(now: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
    10,
  );
}

function bandFor(h: number): Band {
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "midday";
  if (h >= 14 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "late";
}

const GREETING: Record<Band, string> = {
  morning: "Good morning.",
  midday: "Midday.",
  afternoon: "Afternoon.",
  evening: "This evening.",
  late: "Late tonight.",
};

/** A short weather read — DESCRIBES the conditions, never instructs ("Storms
 *  around," not "Keep it indoors"). Finding-not-telling: a calm local states
 *  what it's doing outside and lets the reader decide. */
function moodLine(condition: string, temp: number | null, precipNow: number | null): string {
  const c = condition.toLowerCase();
  if (/thunder|storm/.test(c)) return "Storms moving through.";
  // Rain comes BEFORE the fair-weather lines so the words can never
  // contradict the sky glyph: any rain-text condition (the same signal that
  // draws the rain cloud) yields a rain line, never "Patio weather." The PoP
  // only decides HOW wet — likely (>=50%) reads as a washout, a lower chance
  // as spotty showers.
  if (mentionsWet(condition)) {
    return isActivelyWet(condition, precipNow) ? "Rain in play right now." : "Spotty showers around.";
  }
  if (/snow|sleet|ice|wintry/.test(c)) return "Wintry out there.";
  if (/fog|mist|haze/.test(c)) return "Low and gray.";
  if (temp != null && temp >= 88) return "A hot one out there.";
  if (temp != null && temp <= 38) return "Cold and clear.";
  if (/cloud|overcast/.test(c)) return "Soft, gray light over the county.";
  if (temp != null && temp >= 60 && temp <= 84) return "Patio weather.";
  // Time-neutral fallback that never repeats a word with the greeting
  // ("Good morning. A good day…" doubled "good").
  return "Clear and easy out.";
}

function fmtTime(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default async function TodayCard({
  tonightEvent = null,
}: {
  /** The page already picks the featured/soonest event; passed in so
   *  this card stays a pure composition of existing data. */
  tonightEvent?: TonightEvent;
}) {
  const now = new Date();
  const band = bandFor(easternHour(now));
  const dateStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);

  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const cur = forecast?.hourly?.[0] ?? null;
  const tempNow = cur?.temperature ?? null;
  const condition = cur?.shortForecast ?? "";
  const high = forecast?.daily?.find((p) => p.isDaytime)?.temperature ?? null;

  // The NEXT sun event, not both — sunrise if it hasn't happened yet,
  // otherwise tonight's sunset, otherwise tomorrow's sunrise. (Replaces
  // the redundant sunrise+sunset footer that duplicated this.)
  const st = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  let sun: { label: string; time: string } | null = null;
  if (st.sunrise && now < st.sunrise) {
    sun = { label: "Sunrise", time: fmtTime(st.sunrise)! };
  } else if (st.sunset && now < st.sunset) {
    sun = { label: "Sunset", time: fmtTime(st.sunset)! };
  } else {
    const tmrw = sunTimes(new Date(now.getTime() + 86_400_000), FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
    if (tmrw.sunrise) sun = { label: "Sunrise", time: fmtTime(tmrw.sunrise)! };
  }

  const mood = moodLine(condition, tempNow, cur?.probabilityOfPrecipitation ?? null);

  // Daytime by real sun times (the glyph's sun/moon depends on it).
  const isDay = st.sunrise && st.sunset ? now >= st.sunrise && now < st.sunset : true;
  const variant: SkyVariant | null = condition
    ? iconForShortForecast(condition, isDay)
    : null;

  // Secondary stats — high + next sun event. The big temperature carries
  // "now," so it's dropped from this line to avoid saying it twice.
  const stats = [
    high != null ? `High ${high}°` : null,
    sun ? `${sun.label} ${sun.time}` : null,
  ].filter(Boolean);

  return (
    <section aria-label="Today in Frederick" className="stagger-children" style={{ color: "currentColor" }}>
      {/* The masthead assembles like a published front-endsheet: the dateline,
          the greeting+mood headline, the weather row, and tonight's event rise
          in on load via .stagger-children (one-shot breathe-in; reduced-motion
          renders them static). */}
      {/* Header row — the page's date / day / time, built into the hero
          itself (no separate band below). Date is server-rendered; the clock
          ticks client-side. */}
      <div className="flex items-center justify-between gap-3 text-meta font-semibold uppercase tracking-[0.14em] opacity-70">
        <span suppressHydrationWarning>{dateStr}</span>
        <LiveClock className="font-mono tabular-nums" />
      </div>
      {/* The hook — greeting + a confident weather mood, in the display face.
          The 3-second "I get it" line, now a tighter lead above one compact
          weather row (was a 28px headline stacked over a 64px number). */}
      <h2 className="mt-1.5 font-serif text-[18px] font-semibold leading-snug tracking-tight sm:text-[20px]">
        {GREETING[band]} {mood}
      </h2>

      {/* One compact weather row: the animated glyph + the temperature + the
          high/sunset stats, side by side, so the header stays short. */}
      {(variant || tempNow != null || stats.length > 0) && (
        <div className="mt-2 flex items-center gap-3">
          {variant && (
            <AnimatedSkyGlyph variant={variant} size={44} className="shrink-0 opacity-95" />
          )}
          {tempNow != null && (
            <span className="font-serif text-[40px] font-light leading-none tracking-tight tabular-nums sm:text-[44px]">
              {tempNow}&deg;
            </span>
          )}
          {stats.length > 0 && (
            <span className="text-[12.5px] font-medium leading-snug tabular-nums opacity-90">
              {stats.join("  ·  ")}
            </span>
          )}
        </div>
      )}

      {/* Tonight's headline event — a compact, framed "what's on" row instead
          of a long underlined run-on sentence on the gradient. The when-label
          is a mono eyebrow; the title sits on ONE truncated line so a
          firehose feed title (sponsors, double bills) never blows the hero up
          to three wrapped lines. The whole row is the tap target. */}
      {tonightEvent && (
        <Link
          href={`/events/${tonightEvent.slug}`}
          className="tactile-interactive group mt-3 flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-2.5 py-2"
          style={{
            background: "color-mix(in srgb, currentColor 9%, transparent)",
            // Pressed-glass inlay: a top highlight above the edge ring makes the
            // one tappable object read as set INTO the day's light. Tone-adaptive
            // via currentColor, so it holds over light and dark skies alike.
            boxShadow:
              "inset 0 1px 0 color-mix(in srgb, currentColor 22%, transparent), inset 0 0 0 1px color-mix(in srgb, currentColor 15%, transparent)",
          }}
        >
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, currentColor 16%, transparent)" }}
          >
            <Ticket className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-meta font-semibold uppercase tracking-[0.14em] opacity-65">
              {eventWhenLabel(tonightEvent.starts_at, now, band === "evening" || band === "late")}
            </span>
            <span className="block truncate text-body font-semibold leading-snug">
              {tonightEvent.title}
            </span>
          </span>
          <ChevronRight
            aria-hidden
            className="h-4 w-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2}
          />
        </Link>
      )}

    </section>
  );
}
