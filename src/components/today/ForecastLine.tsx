import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { nextWeatherChange } from "@/lib/weather-verdict";

/**
 * ForecastLine — the "forecast strip" the Today canvas keeps: ONE line,
 * today's range plus the next meaningful change (e.g. "89° → 66° ·
 * Storms around 4 PM"). This is the site-capture inventory's literal
 * "forecast strip (94° to 71°, storms 3 to 8 PM)", and it honors
 * operating rule 6 — weather is context, not a forecast app. It
 * replaces the 33-line, 7-glyph NowDayStrip that the Session 2
 * subtraction removed from the root.
 *
 * Server component; the NWS fetch is cached and shared with TodayCard
 * and MoveStack, so the line costs no extra round trip. Self-hides
 * when there's no usable forecast.
 */
export default async function ForecastLine() {
  const f = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const hourly = f?.hourly ?? [];
  if (hourly.length === 0) return null;

  const temps = hourly
    .slice(0, 24)
    .map((h) => h.temperature)
    .filter((n): n is number => typeof n === "number");
  const range =
    temps.length > 0 ? `${Math.max(...temps)}° → ${Math.min(...temps)}°` : null;
  const change = nextWeatherChange({ hourly, now: new Date() });

  const parts = [range, change].filter(Boolean) as string[];
  if (parts.length === 0) return null;

  return (
    <p
      className="px-1 text-[12px] font-medium tabular-nums"
      style={{ color: "var(--app-ink-3)" }}
    >
      {parts.join(" · ")}
    </p>
  );
}
