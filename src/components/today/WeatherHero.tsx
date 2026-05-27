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
      className="mx-auto flex max-w-[320px] flex-col items-center text-center"
      aria-label={`Current weather: ${cur.temperature}°F, ${cur.shortForecast}`}
      style={{ color: "currentColor" }}
    >
      {/* Section header — pre-launch review caught that the weather
          block had no umbrella heading. Hourly Forecast / More Weather
          Details / 7-Day Forecast each had their own card eyebrows,
          but the actual current-conditions hero (the 78° + condition
          line) just appeared without a "this is the weather" anchor.
          Centered, paper-cream on dark sky, balances the page's
          left-aligned DateLine + DayStrip above with a proper bar
          announcement here. */}
      <p
        className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70 sm:text-[11px]"
        style={{ color: "currentColor" }}
      >
        Weather · Frederick
      </p>

      {/* Atmospheric sky glyph — small, sits above the temp like
          the iOS sun in its lens flare. */}
      <div className="mt-2.5">
        <AnimatedSkyGlyph variant={curVariant} size={56} />
      </div>

      {/* Huge thin temperature — the headline. Serif at light weight
          reads as editorial / almanac, in contrast to iOS's sans-thin
          but the same gestalt: the number is the page. Tabular nums
          + negative letter spacing keep the digits + degree symbol
          balanced; the new section header (WEATHER · FREDERICK) above
          anchors the column so the temp doesn't read as "floating
          off-center" the way it did when the SkyHero opened straight
          on the temperature with no eyebrow. */}
      <p
        className="mt-1 font-serif font-light leading-none tabular-nums"
        style={{
          fontSize: "clamp(72px, 22vw, 104px)",
          letterSpacing: "-0.03em",
        }}
      >
        {cur.temperature}&deg;
      </p>

      {/* Condition — one line, balanced wrap when long. */}
      <p
        className="mt-1.5 text-[15px] font-medium opacity-90"
        style={{ textWrap: "balance" } as React.CSSProperties}
      >
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
          className="mt-2 text-[12.5px] leading-snug opacity-70"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          {nextChange}
        </p>
      )}
    </section>
  );
}
