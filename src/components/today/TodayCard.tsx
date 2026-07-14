import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes } from "@/lib/sun";
import DaylightLeftInline from "@/components/today/DaylightLeftInline";
import { weatherVerdict } from "@/lib/weather-verdict";
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

type Band = "morning" | "midday" | "afternoon" | "evening" | "late" | "overnight";

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
  // The dark hours split in two: 22–02 is still "tonight" to a human;
  // 02–05 is not — a calm local calls those the early hours (the 4:18 AM
  // audit render greeted the reader with "Late tonight.").
  if (h >= 22 || h < 2) return "late";
  return "overnight";
}

const GREETING: Record<Band, string> = {
  morning: "Good morning.",
  midday: "Midday.",
  afternoon: "Afternoon.",
  evening: "This evening.",
  late: "Late tonight.",
  overnight: "The early hours.",
};

// The weather read beside the greeting comes from lib/weather-verdict —
// the SAME engine NowIntel uses — so the hero and the "right now" line
// can never disagree about one sky in one viewport. (This card used to
// carry its own moodLine() with a fog branch the shared engine lacked;
// the 4:18 AM audit caught "Low and gray." here over "A fine day to get
// out." below. One engine owns the read now.)

function fmtTime(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default async function TodayCard() {
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

  const mood =
    cur && forecast
      ? weatherVerdict({
          temp: cur.temperature,
          shortForecast: cur.shortForecast,
          precipNow: cur.probabilityOfPrecipitation ?? 0,
          hourly: forecast.hourly,
          now,
        }).line
      : null;

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
      <div className="flex items-center justify-between gap-3 text-meta font-semibold uppercase tracking-[0.14em]">
        <span suppressHydrationWarning>{dateStr}</span>
        <LiveClock className="font-mono tabular-nums" />
      </div>
      {/* The hook — greeting + a confident weather mood, in the display face.
          The 3-second "I get it" line, now a tighter lead above one compact
          weather row (was a 28px headline stacked over a 64px number). */}
      <h2 className="mt-1.5 font-serif text-[18px] font-semibold leading-snug tracking-tight sm:text-[20px]">
        {GREETING[band]}
        {mood ? ` ${mood}` : ""}
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
              {/* Live daylight-left, moved here from TodayContext (client-side
                  so it stays accurate; the server card would freeze it). */}
              <DaylightLeftInline />
            </span>
          )}
        </div>
      )}

      {/* Tonight's headline event moved OUT of this card (owner call,
          2026-07-10): it now renders as its own solo card directly below the
          weather hero — see TonightSolo in app/(app)/today/page.tsx. */}
    </section>
  );
}
