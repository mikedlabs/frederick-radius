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
      className="flex flex-col gap-2"
      aria-label={`Current weather: ${cur.temperature}°F, ${cur.shortForecast}`}
      style={{ color: "currentColor" }}
    >
      {/* TOP ROW: H/L only, right-aligned. The "WEATHER · FREDERICK"
          eyebrow was removed pre-launch — the giant 78° + sky glyph
          below makes it obvious what the block is; an eyebrow that
          says "weather" on top of weather reads as redundant. The
          H/L stays so the row carries a useful number, not chrome. */}
      {(high !== undefined || low !== undefined) && (
        <div className="flex items-baseline justify-end gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] tabular-nums opacity-70 sm:text-[12px]">
            {high !== undefined && <>H {high}&deg;</>}
            {high !== undefined && low !== undefined && (
              <span className="mx-1.5 opacity-50">·</span>
            )}
            {low !== undefined && <>L {low}&deg;</>}
          </p>
        </div>
      )}

      {/* MIDDLE ROW: huge temperature on the LEFT, animated sky glyph
          + condition + nextChange on the RIGHT. The two columns share
          the row so the gradient stops being a wide canvas with text
          centered in a 320px column. Temp is still the headline —
          the right side is the meta. */}
      <div className="flex items-center gap-4">
        <p
          className="font-serif font-light leading-none tabular-nums"
          style={{
            fontSize: "clamp(80px, 28vw, 128px)",
            letterSpacing: "-0.04em",
            flexShrink: 0,
          }}
        >
          {cur.temperature}&deg;
        </p>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <AnimatedSkyGlyph variant={curVariant} size={48} />
          <p
            className="text-[14px] font-medium leading-snug opacity-95"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            {cur.shortForecast}
          </p>
          {nextChange && (
            <p
              className="text-[12px] leading-snug opacity-75"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              {nextChange}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
