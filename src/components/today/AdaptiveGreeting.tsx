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
 * personalized. Defaults to the Visitor voice when no mode is set,
 * which is the welcoming, orientation-friendly tone the brief calls
 * for as the first-impression default.
 *
 * The honest-weather logic is preserved: NWS hedged forecasts ("a
 * slight chance of rain") never get a "duck inside" line, because
 * the app shouldn't ask someone to change their plan over a 30%
 * possibility.
 */
function pickGreeting(
  hour: number,
  conditions: string,
  precip: number,
  mode: Mode,
): string {
  const hedged = /chance|slight|isolated|scattered|patchy|areas of|possible|partly|a few/i.test(conditions);
  const activeWet = /\b(rain|showers?|thunderstorms?|storms?|snow|sleet|drizzle)\b/i.test(conditions) && !hedged;
  const wet = activeWet || precip >= 65;
  const fog = /fog|mist|haze/i.test(conditions);
  const sunny = /sun|clear|fair/i.test(conditions);
  const cloudy = /cloud|overcast/i.test(conditions);
  const isVisitor = mode === "visitor";

  if (hour >= 5 && hour < 8) {
    if (wet) return isVisitor ? "Wet start. Find a window seat." : "Wet morning, slow start.";
    if (sunny) return isVisitor ? "Catch the sunrise. Frederick is glowing." : "First light. Bring coffee.";
    return isVisitor ? "Good morning, Frederick." : "Morning. The county's up.";
  }
  if (hour >= 8 && hour < 12) {
    if (wet) return isVisitor ? "Cozy morning. The museum is calling." : "Rain. Indoor day.";
    if (sunny) return isVisitor ? "Bright morning in Frederick." : "Clear morning. Get out early.";
    if (cloudy) return isVisitor ? "Soft morning in Frederick." : "Overcast morning. Mellow start.";
    return isVisitor ? "Good morning. What's open?" : "Morning. Same time, fresh week.";
  }
  if (hour >= 12 && hour < 17) {
    if (wet) return isVisitor ? "Rainy afternoon. Duck inside somewhere good." : "Wet afternoon. Hide indoors.";
    if (sunny) return isVisitor ? "Perfect afternoon. What's the plan?" : "Sun's out. Use it.";
    if (cloudy) return isVisitor ? "Mild afternoon in Frederick." : "Quiet afternoon.";
    return isVisitor ? "Good afternoon." : "Midday check.";
  }
  if (hour >= 17 && hour < 20) {
    if (wet) return isVisitor ? "Wet evening. There's a bar with your name on it." : "Wet evening. Pick a tap room.";
    if (sunny) return isVisitor ? "Golden hour. Window seat or rooftop?" : "Golden hour. You know the spots.";
    return isVisitor ? "Good to see you in Frederick." : "Evening. What's the move?";
  }
  if (hour >= 20 && hour < 23) {
    if (fog) return isVisitor ? "Foggy night. Carroll Creek looks like a film set." : "Fog rolling in. Easy lights.";
    if (wet) return isVisitor ? "Rainy night, warm rooms." : "Rain, lamps, late drink.";
    return isVisitor ? "Frederick after dark." : "Late tonight. Still open?";
  }
  // 23 - 4 (overnight)
  return isVisitor ? "Frederick is quiet now. Still beautiful." : "Late hours. The county sleeps light.";
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
