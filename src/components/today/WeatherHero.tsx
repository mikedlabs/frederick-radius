import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { nextWeatherChange } from "@/lib/weather-verdict";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";

/**
 * WeatherHero — the weather slug at the top of /now.
 *
 * REDESIGNED to mirror the iOS Weather hero: the temp + condition + H/L
 * sit DIRECTLY on the SkyHero gradient instead of inside a paper card.
 * The sky is already the canvas; the previous design's card-on-sky
 * fought the gradient. Now the hero IS the sky, with the time-of-day
 * tint reading through the type.
 *
 * Color is `currentColor` so it inherits SkyHero's tone-aware ink
 * (paper-cream on dark skies, warm ink on light skies). One contrast
 * choice, two readable surfaces.
 *
 * What got cut (and where it went):
 *   - The brand-tone gradient card background. The SkyHero IS the
 *     background now.
 *   - The forecast verdict line. AdaptiveGreeting above already
 *     carries the editorial mood ("Golden hour. Window seat?"). Two
 *     verdicts back to back read as repetition.
 *   - The inline wind / precip stat row. Those move into the small
 *     supplemental grid below the hourly + weekly cards.
 *   - The hourly chart + 7-day. Both lift out into their own cards
 *     below SkyHero (HourlyForecast.tsx + WeeklyForecast.tsx), so
 *     they read as separate, scrollable sections in the iOS pattern
 *     instead of being crammed into one block.
 *
 * What stays:
 *   - The huge thin temperature, now ~96px serif. The serif is the
 *     editorial-newspaper register that suits the almanac feel; iOS
 *     uses SF thin for the same dramatic-but-quiet effect.
 *   - AnimatedSkyGlyph (CSS-only weather icon — sun, clouds, rain).
 *   - The time-stamped nextChange ("Rain starting around 5 PM"),
 *     surfaced as a small subtitle. This is real operational info
 *     AdaptiveGreeting doesn't give.
 */
export default async function WeatherHero() {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const cur = forecast?.hourly?.[0] ?? null;

  if (!cur) {
    return (
      <p
        className="text-center text-[12px] opacity-70"
        style={{ color: "currentColor" }}
      >
        Weather is briefly unavailable.
      </p>
    );
  }

  // Today's high/low — first daytime period is today's high (or
  // tomorrow's if NWS has rolled over after dark); first non-daytime
  // is today's low.
  const today = forecast?.daily ?? [];
  const todayDay = today.find((p) => p.isDaytime);
  const todayNight = today.find((p) => !p.isDaytime);
  const high = todayDay?.temperature;
  const low = todayNight?.temperature;

  // nextChange — the time-stamped operational signal under the H/L,
  // surfaced quietly. AdaptiveGreeting carries the time-of-day mood;
  // this carries the schedule.
  const nextChange = forecast?.hourly
    ? nextWeatherChange({ hourly: forecast.hourly, now: new Date() })
    : null;

  const curVariant: SkyVariant = iconForShortForecast(cur.shortForecast);

  return (
    <section
      className="flex flex-col items-center text-center"
      aria-label={`Current weather: ${cur.temperature}°F, ${cur.shortForecast}`}
      style={{ color: "currentColor" }}
    >
      {/* Atmospheric sky glyph — small, sits above the temp like
          the iOS sun in its lens flare. */}
      <AnimatedSkyGlyph variant={curVariant} size={56} />

      {/* Huge thin temperature — the headline. Serif at light weight
          reads as editorial / almanac, in contrast to iOS's sans-thin
          but the same gestalt: the number is the page. */}
      <p
        className="mt-1 font-serif font-light leading-none tabular-nums"
        style={{
          fontSize: "clamp(72px, 22vw, 104px)",
          letterSpacing: "-0.03em",
        }}
      >
        {cur.temperature}&deg;
      </p>

      {/* Condition — one line. */}
      <p className="mt-1 text-[15px] font-medium opacity-90">
        {cur.shortForecast}
      </p>

      {/* H/L — tabular-nums so the colon and degree symbols align
          visually with the temperature above. */}
      {(high !== undefined || low !== undefined) && (
        <p className="mt-1 text-[13px] font-semibold tabular-nums opacity-75">
          {high !== undefined && <>H:{high}&deg;</>}
          {high !== undefined && low !== undefined && (
            <span className="mx-1.5 opacity-50">·</span>
          )}
          {low !== undefined && <>L:{low}&deg;</>}
        </p>
      )}

      {/* nextChange — quiet, optional. Only renders when there's a
          real time-stamped heads-up worth saying. */}
      {nextChange && (
        <p
          className="mt-2 max-w-[280px] text-[12.5px] leading-snug opacity-70"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          {nextChange}
        </p>
      )}
    </section>
  );
}
