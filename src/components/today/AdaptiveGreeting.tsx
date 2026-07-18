import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { readModeFromCookie } from "@/lib/mode-server";
import type { Mode } from "@/hooks/useMode";
import HomeMuniChip from "./HomeMuniChip";
import InterestsChip from "./InterestsChip";
import PersonalGreetingLine from "./PersonalGreetingLine";

/**
 * Time- and weather-aware headline, flavored by the user's chosen
 * lens (Visitor or Resident). Mode is read from a server cookie
 * mirrored by useMode.write(), so the headline lands in the right
 * voice on the first paint — no client-side flash from generic to
 * personalized.
 *
 * Honest-weather policy (May 2026 rewrite)
 *   NWS hourly forecasts describe the WHOLE period — a "Showers
 *   Likely" hour can have a sunny 20-minute gap in it. The old
 *   copy made confident claims ("Wet afternoon. Hide indoors.")
 *   that the sky could disprove in the middle of the same hour.
 *   The new copy never commands an action it can't keep, and
 *   never asserts a state it isn't watching live:
 *     - "Showers in the X forecast." instead of "Wet X. Hide indoors."
 *     - "Sun for now." instead of "Perfect afternoon."
 *     - Strict-active criteria: NWS phrase must lack ALL hedge
 *       words AND precip must be ≥80% (was 65). Anything below
 *       that bar reads as forecast, not claim.
 */
function pickGreeting(
  hour: number,
  conditions: string,
  precip: number,
  mode: Mode,
): string {
  const hedged = /chance|slight|isolated|scattered|patchy|areas of|possible|partly|a few|likely/i.test(conditions);
  const activeWet = /\b(rain|showers?|thunderstorms?|storms?|snow|sleet|drizzle)\b/i.test(conditions) && !hedged;
  // "Wet" now requires either an unhedged active phrase or a high-
  // confidence precip number. The old 65% bar tripped on "Showers
  // Likely" forecasts that NWS itself classifies as 60-70% — i.e.,
  // not happening right now most of the time.
  const wet = activeWet || precip >= 80;
  // Soft hedge — there's rain in the forecast but it isn't
  // happening confidently right now. Drives the "Showers around"
  // class of copy, never the "Hide indoors" class.
  const wetMaybe = !wet && /\b(rain|showers?|thunderstorms?|storms?|snow|sleet|drizzle)\b/i.test(conditions);
  const fog = /fog|mist|haze/i.test(conditions);
  const sunny = /sun|clear|fair/i.test(conditions);
  const cloudy = /cloud|overcast/i.test(conditions);
  const isVisitor = mode === "visitor";

  if (hour >= 5 && hour < 8) {
    if (wet) return isVisitor ? "Rain is in the morning forecast." : "Showers are expected this morning.";
    if (wetMaybe) return isVisitor ? "Rain is in the morning forecast." : "Showers are possible this morning.";
    if (sunny) return isVisitor ? "Sunrise window is open." : "First light brings coffee weather.";
    return isVisitor ? "Good morning, Frederick." : "The county is up this morning.";
  }
  if (hour >= 8 && hour < 12) {
    if (wet) return isVisitor ? "Showers are around, so carry a layer." : "Showers are expected this morning.";
    if (wetMaybe) return isVisitor ? "Rain is in the morning forecast." : "Showers are in the forecast.";
    if (sunny) return isVisitor ? "It is a sunny morning." : "The morning is clear.";
    if (cloudy) return isVisitor ? "It is overcast this morning." : "The morning is overcast and quiet.";
    return isVisitor ? "Good morning. What is open?" : "The county is moving this morning.";
  }
  if (hour >= 12 && hour < 17) {
    if (wet) return isVisitor ? "Showers are around, so carry a layer." : "Showers are expected this afternoon.";
    if (wetMaybe) return isVisitor ? "Rain is in the afternoon forecast." : "Showers are in the forecast.";
    if (sunny) return isVisitor ? "The sun is out for now." : "The sun is out.";
    if (cloudy) return isVisitor ? "It is a mild afternoon in Frederick." : "The afternoon is quiet.";
    return isVisitor ? "It is a good afternoon in Frederick." : "The day is moving along.";
  }
  if (hour >= 17 && hour < 20) {
    if (wet) return isVisitor ? "Showers are expected this evening." : "Showers are expected this evening.";
    if (wetMaybe) return isVisitor ? "Rain is in the evening forecast." : "Showers are in the forecast.";
    if (sunny) return isVisitor ? "Golden hour has started." : "Golden hour has started, and you know the spots.";
    return isVisitor ? "Good to see you in Frederick." : "What's the move this evening?";
  }
  if (hour >= 20 && hour < 23) {
    if (fog) return isVisitor ? "Fog is rolling in." : "Fog is rolling in under the lights.";
    if (wet) return isVisitor ? "Showers are expected tonight." : "Showers are expected tonight.";
    if (wetMaybe) return isVisitor ? "Rain is in the overnight forecast." : "Showers are in the forecast.";
    return isVisitor ? "Frederick stays active after dark." : "It is late, but some places are still open.";
  }
  // 23 - 4 (overnight)
  return isVisitor ? "Frederick is quiet now. Still beautiful." : "The county sleeps lightly at this hour.";
}

export default async function AdaptiveGreeting() {
  const now = new Date();
  const nyHour = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(now),
    10
  );
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(now);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(now);

  let conditions = "";
  let precip: number | undefined;
  try {
    const forecast = await getNwsForecast(FREDERICK_CENTER);
    if (forecast?.hourly[0]) {
      conditions = forecast.hourly[0].shortForecast;
      precip = forecast.hourly[0].probabilityOfPrecipitation ?? undefined;
    }
  } catch {
    // graceful: fall through to time-only greeting
  }

  // Mode comes from a cookie mirrored by useMode's write() so the
  // headline lands in the right voice on the first paint. Defaults
  // to Visitor when unset — the welcoming, orientation-friendly tone.
  const mode = await readModeFromCookie();
  const headline = pickGreeting(nyHour, conditions, precip ?? 0, mode);

  // Day + time only. Current conditions and temperature live in the
  // WeatherHero card directly below, so the header never repeats them.
  const dateline = `${weekday} · ${time}`;

  return (
    <header className="space-y-1">
      <p
        className="text-[10px] font-medium uppercase tracking-[0.12em] opacity-70 sm:text-[11px]"
        style={{ color: "currentColor" }}
      >
        {dateline}
      </p>
      {/* Personal soft headline. Renders only when the user picked a
          home municipality in /welcome — establishes context as
          "Tonight in Brunswick" before the weather-aware main line
          carries the mood. Server snapshot is empty, so the eyebrow +
          main headline still read cleanly while the personal line
          hydrates in. */}
      <PersonalGreetingLine />
      <h1
        className="font-serif text-[22px] font-semibold leading-[1.1] tracking-tight sm:text-[34px]"
        style={{ color: "currentColor", textWrap: "balance" } as React.CSSProperties}
      >
        {headline}
      </h1>
      {/* Quiet personalization signals from /welcome's Phase D picks.
          Both chips render nothing if their step was skipped — the
          header collapses cleanly back to just the headline. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <HomeMuniChip />
        <InterestsChip />
      </div>
    </header>
  );
}
