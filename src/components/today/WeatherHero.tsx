import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { nextWeatherChange } from "@/lib/weather-verdict";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";
import { currentSkyTone } from "./SkyHero";

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

  // Day/night from the same hour-based signal that tints the SkyHero,
  // so the glyph and the sky agree — a clear night shows the moon, not
  // a rotating sun.
  const isDay = currentSkyTone() !== "dark";
  const curVariant: SkyVariant = iconForShortForecast(cur.shortForecast, isDay);

  // Sentence-case the NWS shortForecast. Raw NWS sends Title Case
  // ("Chance Showers And Thunderstorms") which reads like XML output.
  // First letter capitalized, everything else lowercased — except
  // the words we WANT capitalized (proper nouns rarely appear in
  // NWS short forecasts, so plain sentence case is safe).
  const condition = (cur.shortForecast || "")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

  // Forecast freshness — quiet "Updated · 6:38 PM" under the location.
  // Reads as accountability ("this isn't stale") without competing
  // with the temp.
  const asOf = forecast?.asOf
    ? new Date(forecast.asOf)
    : null;
  const updatedAt = asOf
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }).format(asOf)
    : null;

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={`Current weather in Frederick, Maryland: ${cur.temperature}°F, ${condition}`}
      style={{ color: "currentColor" }}
    >
      {/* LOCATION HEADER — A weather screen's first job is telling
          you where the forecast applies. Sits ABOVE the temperature
          so a quick glance answers "this is Frederick" before the
          eye reaches anything else. Updated-at lives just under,
          small and quiet, as accountability. */}
      <div className="flex flex-col gap-0.5">
        <p
          className="text-[15px] font-semibold leading-tight tracking-tight"
          style={{ color: "currentColor" }}
        >
          Frederick, MD
        </p>
        {updatedAt && (
          <p
            className="text-[10.5px] font-medium tracking-wide opacity-70"
          >
            Updated · {updatedAt}
          </p>
        )}
      </div>

      {/* HERO ROW — temperature unit (number + H/L stacked under it)
          on the LEFT, paired with condition unit (sky glyph + text +
          nextChange) on the RIGHT. Each column is internally tight
          so the eye doesn't drift between five anchor points anymore:
          read the number + its range, then read the condition + its
          schedule. Two beats. */}
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <p
            className="font-serif font-light leading-none tabular-nums"
            style={{
              fontSize: "clamp(76px, 26vw, 120px)",
              letterSpacing: "-0.04em",
            }}
          >
            {cur.temperature}&deg;
          </p>
          {(high !== undefined || low !== undefined) && (
            <p className="mt-1 text-[12px] font-semibold tabular-nums opacity-75 sm:text-[13px]">
              {high !== undefined && <>H {high}&deg;</>}
              {high !== undefined && low !== undefined && (
                <span className="mx-1.5 opacity-50">·</span>
              )}
              {low !== undefined && <>L {low}&deg;</>}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-2">
          {/* Glyph scaled up from 48 → 72 so it matches the optical
              weight of the temperature next to it. The lightning
              bolt was reading as a tiny accent before; at 72 it
              carries the warning cue properly. */}
          <AnimatedSkyGlyph variant={curVariant} size={72} />
          <p
            className="text-[14px] font-medium leading-snug opacity-95"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            {condition}
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
