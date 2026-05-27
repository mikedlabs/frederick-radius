import { Sunrise, Sunset, Wind, Droplets } from "lucide-react";
import { daylightDelta } from "@/lib/almanac";
import { getAirQuality, pickWorstAqi } from "@/lib/integrations/airnow";
import { getKfdkMetar, dewpointComfort } from "@/lib/integrations/aviationweather";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * AlmanacFooter — the quiet weather slug that sits right under the
 * forecast block on /now. Anchors the page in real Frederick time
 * and (when the relevant env vars are set) carries the day's air and
 * humidity signals next to the sun clock:
 *
 *   Sunrise 6:42a · Sunset 8:23p · 2 min longer · AQI 42 Good · Muggy
 *
 * Pure server component. Each external fetch (AirNow, KFDK METAR) is
 * graceful: returns null on failure or absent key, the chip is
 * silently hidden, the rest of the strip still renders. Request-cache
 * dedupes when the same fetch fires elsewhere in the page tree.
 */
export default async function AlmanacFooter() {
  // eslint-disable-next-line react-hooks/purity
  const now = new Date();
  const delta = daylightDelta(now);
  if (!delta) return null;

  // AirNow AQI — always surface the chip when we have a reading,
  // colored by the category (green = Good, amber = Moderate, brick =
  // Unhealthy, etc.). AQI is one of the expected metrics next to
  // sunrise + sunset on this strip. Returns null without an
  // AIRNOW_API_KEY, so the chip is hidden when the env var isn't set.
  const aqi = await getAirQuality(FREDERICK_CENTER).catch(() => null);
  const worst = aqi ? pickWorstAqi(aqi) : null;

  // KFDK METAR dewpoint comfort — surfaces a label ("Sticky", "Muggy",
  // "Oppressive", "Very dry") inline ONLY at the edges of the comfort
  // spectrum. The "comfortable" middle band is silent so we don't add
  // noise on a normal day. Public-domain US federal data, no key.
  const metar = await getKfdkMetar().catch(() => null);
  const comfort = metar ? dewpointComfort(metar.dewpointF) : null;
  const showComfort = comfort && comfort.worthSurfacing;

  const fmtClock = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    })
      .format(d)
      // "6:42 AM" → "6:42a" — saves a few px and reads naturally in
      // a long quiet line.
      .replace(/\s?AM$/i, "a")
      .replace(/\s?PM$/i, "p");

  const sunriseStr = fmtClock(delta.today.sunrise);
  const sunsetStr = fmtClock(delta.today.sunset);

  // Compact delta. The full "2 minutes longer than yesterday" form was
  // editorial when the footer sat at the page bottom; in its current
  // home next to the weather it needs to fit on one line at any
  // viewport. "+2m" / "−3m" / "—" keeps the sign-of-the-season signal
  // without the prose tail. The verbose version still ships on the
  // hover tooltip for the curious.
  const dMin = delta.deltaMinutes;
  let deltaShort: string;
  let deltaTitle: string;
  if (dMin === 0) {
    deltaShort = "—";
    deltaTitle = "Same length as yesterday";
  } else if (dMin > 0) {
    deltaShort = `+${dMin}m`;
    deltaTitle = `${dMin} minute${dMin === 1 ? "" : "s"} longer than yesterday`;
  } else {
    const n = Math.abs(dMin);
    deltaShort = `−${n}m`;
    deltaTitle = `${n} minute${n === 1 ? "" : "s"} shorter than yesterday`;
  }

  return (
    <footer
      className="-mx-4 mt-2 flex items-center justify-center gap-x-3 overflow-x-auto whitespace-nowrap px-4 py-3 text-center text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ color: "var(--app-ink-3)" }}
      aria-label="Today in Frederick"
    >
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Sunrise className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
        {sunriseStr}
      </span>
      <span aria-hidden style={{ color: "var(--app-border)" }}>
        ·
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Sunset className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
        {sunsetStr}
      </span>
      <span aria-hidden style={{ color: "var(--app-border)" }}>
        ·
      </span>
      <span className="tabular-nums" title={deltaTitle}>
        {deltaShort}
      </span>
      {worst && (
        <>
          <span aria-hidden style={{ color: "var(--app-border)" }}>
            ·
          </span>
          <span
            className="inline-flex items-center gap-1 font-semibold tabular-nums"
            style={{ color: worst.category.color }}
            title={`AQI ${worst.aqi} ${worst.category.name} (${worst.parameter}) — observed in ${worst.reportingArea}`}
          >
            <Wind className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
            AQI {worst.aqi}
          </span>
        </>
      )}
      {showComfort && metar && (
        <>
          <span aria-hidden style={{ color: "var(--app-border)" }}>
            ·
          </span>
          <span
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: comfort.color }}
            title={`Dewpoint ${metar.dewpointF}°F at KFDK — ${comfort.label.toLowerCase()}`}
          >
            <Droplets className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
            {comfort.label}
          </span>
        </>
      )}
    </footer>
  );
}
