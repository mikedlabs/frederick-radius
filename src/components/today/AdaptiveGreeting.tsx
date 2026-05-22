import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

function pickGreeting(hour: number, conditions: string, precip: number): string {
  // Honest weather: NWS shortForecast like "Isolated Rain Showers" or
  // "Slight Chance Rain" describes a POSSIBILITY, not active rain, and
  // precip is a percent chance — not "it's raining". Telling someone to
  // "duck inside" on a dry 30%-chance day is the app lying. Only call it
  // wet when conditions name active precip WITHOUT a hedge, or the
  // chance is genuinely high.
  const hedged = /chance|slight|isolated|scattered|patchy|areas of|possible|partly|a few/i.test(conditions);
  const activeWet = /\b(rain|showers?|thunderstorms?|storms?|snow|sleet|drizzle)\b/i.test(conditions) && !hedged;
  const wet = activeWet || precip >= 65;
  const fog = /fog|mist|haze/i.test(conditions);
  const sunny = /sun|clear|fair/i.test(conditions);
  const cloudy = /cloud|overcast/i.test(conditions);

  if (hour >= 5 && hour < 8) {
    if (wet) return "Wet start in Frederick.";
    if (sunny) return "Catch the sunrise — Frederick is glowing.";
    return "Good morning, Frederick.";
  }
  if (hour >= 8 && hour < 12) {
    if (wet) return "Cozy morning — the museum is calling.";
    if (sunny) return "Bright morning in Frederick.";
    if (cloudy) return "Soft morning in Frederick.";
    return "Good morning.";
  }
  if (hour >= 12 && hour < 17) {
    if (wet) return "Rainy afternoon — duck inside somewhere good.";
    if (sunny) return "Perfect afternoon. What's the plan?";
    if (cloudy) return "Mild afternoon in Frederick.";
    return "Good afternoon.";
  }
  if (hour >= 17 && hour < 20) {
    if (wet) return "Wet evening — there's a bar with your name on it.";
    if (sunny) return "Golden hour. Window seat or rooftop?";
    return "Good to see you in Frederick.";
  }
  if (hour >= 20 && hour < 23) {
    if (fog) return "Foggy night — Carroll Creek looks like a film set.";
    if (wet) return "Rainy night, warm rooms.";
    return "Frederick after dark.";
  }
  // 23–4
  return "Frederick is quiet now — but still beautiful.";
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

  const headline = pickGreeting(nyHour, conditions, precip ?? 0);

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
      <h1
        className="font-serif text-[22px] font-semibold leading-[1.1] tracking-tight sm:text-[34px]"
        style={{ color: "currentColor", textWrap: "balance" } as React.CSSProperties}
      >
        {headline}
      </h1>
    </header>
  );
}
