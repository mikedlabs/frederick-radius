import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * HourlySummary — informative collapsed-state label for the Hourly
 * disclosure on /now. The user's critique: every disclosure should
 * either carry a real summary or none should. The 7-Day disclosure
 * already does this well ("7 days · 51° to 79° · 1 day of rain");
 * this is the matching piece for Hourly.
 *
 * What we compute over the next 12 hours:
 *   - Temperature trajectory (rising / falling / flat by end-of-window).
 *   - Earliest rain/storm window if any (start hour → end hour).
 *
 * Output examples:
 *   - "12 hours · 78° → 67° · Storms 8–11 PM"
 *   - "12 hours · 78° → 80° · Clearing overnight"
 *   - "12 hours · 67° → 72°"            (no notable weather)
 *
 * Pure server component. Same getNwsForecast call as everything else
 * on /now — the fetch is request-deduped so this is free.
 */
export default async function HourlySummary() {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const hours = forecast?.hourly?.slice(0, 12) ?? [];
  if (hours.length === 0) return null;

  const start = hours[0];
  const end = hours[hours.length - 1];
  const trajectory =
    end.temperature > start.temperature
      ? `${start.temperature}° → ${end.temperature}°`
      : end.temperature < start.temperature
        ? `${start.temperature}° → ${end.temperature}°`
        : `${start.temperature}° steady`;

  // Find the earliest rain/storm window. We bucket each hour by a
  // wet/dry flag using the short forecast string; the loop just
  // captures the first wet stretch since the user reads "Storms
  // 8–11 PM" not "Storms 8–11 PM and then again 1–3 AM."
  const isWet = (s: string) => /rain|shower|storm|thunder|drizzle/i.test(s);
  let firstWetIdx = -1;
  let lastWetIdx = -1;
  for (let i = 0; i < hours.length; i++) {
    if (isWet(hours[i].shortForecast)) {
      if (firstWetIdx === -1) firstWetIdx = i;
      lastWetIdx = i;
    } else if (firstWetIdx !== -1) {
      // Hit dry hour after at least one wet hour — stop the window
      // so we don't merge two distinct rain bands.
      break;
    }
  }

  function clockShort(d: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: true,
    })
      .format(d)
      .replace(/\s?AM$/i, " AM")
      .replace(/\s?PM$/i, " PM")
      .replace(/^0+/, "");
  }

  let weatherPhrase: string | null = null;
  if (firstWetIdx !== -1) {
    const startHour = new Date(hours[firstWetIdx].startTime);
    const endHour = new Date(hours[lastWetIdx].endTime);
    // Pick the lead noun based on what the NWS forecast says — storm
    // beats rain beats shower in severity, so we use the strongest
    // word that appears anywhere in the window.
    const windowText = hours
      .slice(firstWetIdx, lastWetIdx + 1)
      .map((h) => h.shortForecast.toLowerCase())
      .join(" ");
    const lead = /(thunder|storm)/i.test(windowText)
      ? "Storms"
      : /shower/i.test(windowText)
        ? "Showers"
        : "Rain";
    // "Storms 8–11 PM" — collapse AM/PM when both ends share the
    // suffix; keep both when they don't.
    const sLabel = clockShort(startHour);
    const eLabel = clockShort(endHour);
    const sParts = sLabel.split(" ");
    const eParts = eLabel.split(" ");
    const compact =
      sParts.length === 2 && eParts.length === 2 && sParts[1] === eParts[1]
        ? `${sParts[0]}–${eLabel}`
        : `${sLabel}–${eLabel}`;
    weatherPhrase = `${lead} ${compact}`;
  } else {
    // No wet hours in the window — check if the LAST hour says
    // "clear" so we can say "Clearing overnight." Otherwise omit.
    if (/clear|sunny|fair/i.test(end.shortForecast)) {
      weatherPhrase = end.isDaytime ? null : "Clearing overnight";
    }
  }

  const parts = [`${hours.length} hours`, trajectory];
  if (weatherPhrase) parts.push(weatherPhrase);
  return <>{parts.join(" · ")}</>;
}
