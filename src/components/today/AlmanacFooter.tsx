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
export default async function AlmanacFooter({ inSky = false }: { inSky?: boolean } = {}) {
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
    // eslint-disable-next-line no-restricted-syntax -- standalone no-data glyph, not prose
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

  // When mounted INSIDE SkyHero (inSky=true), the row uses
  // currentColor with opacity so it inherits the sky-tone ink
  // (paper-cream on dark sky, warm-ink on light sky). AQI and
  // comfort still use their own status colors — they're warning
  // signals; if it's "Oppressive" the user needs to see that even
  // through the sky gradient.
  const sepColor = inSky ? "currentColor" : "var(--app-border)";
  const sepOpacity = inSky ? 0.45 : 1;
  const baseColor = inSky ? "currentColor" : "var(--app-ink-3)";
  const baseOpacity = inSky ? 0.85 : 1;

  return (
    <footer
      className={
        inSky
          ? "mt-3 flex items-center justify-center gap-x-3 overflow-x-auto whitespace-nowrap text-[11px] sm:text-[12px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "-mx-4 mt-2 flex items-center justify-center gap-x-3 overflow-x-auto whitespace-nowrap px-4 py-3 text-center text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      }
      style={{ color: baseColor, opacity: baseOpacity }}
      aria-label="Today in Frederick"
    >
      {/* Sunrise + sunset are anchored to actual Frederick geography:
          the sun comes up over the Monocacy (east of downtown) and
          drops behind Catoctin (the ridge to the west of the city).
          Both are year-round true — Catoctin is always west of
          Frederick; the Monocacy is always east. Names are always
          visible (mobile included) because they're the whole point —
          the page should read as Frederick from the first glance. */}
      <span
        className="inline-flex items-center gap-1 tabular-nums"
        title={`Sun rises over the Monocacy at ${sunriseStr}`}
      >
        <Sunrise className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
        <span className="font-mono">{sunriseStr}</span>
        <span style={{ opacity: 0.7 }}> over Monocacy</span>
      </span>
      <span aria-hidden style={{ color: sepColor, opacity: sepOpacity }}>
        ·
      </span>
      <span
        className="inline-flex items-center gap-1 tabular-nums"
        title={`Sun sets behind Catoctin at ${sunsetStr}`}
      >
        <Sunset className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
        <span className="font-mono">{sunsetStr}</span>
        <span style={{ opacity: 0.7 }}> behind Catoctin</span>
      </span>
      {/* "+2m" delta dropped from the in-sky variant — it was cryptic
          on a tight row. When AlmanacFooter mounts in its old
          standalone position (inSky=false), the delta still ships
          with the full title tooltip for the curious. In the gradient
          hero, sunrise + sunset are enough; the delta is editorial
          and not worth the confusion tax. */}
      {!inSky && (
        <>
          <span aria-hidden style={{ color: sepColor, opacity: sepOpacity }}>
            ·
          </span>
          <span className="font-mono tabular-nums" title={deltaTitle}>
            {deltaShort}
          </span>
        </>
      )}
      {worst && (
        <>
          <span aria-hidden style={{ color: sepColor, opacity: sepOpacity }}>
            ·
          </span>
          <span
            className="inline-flex items-center gap-1 font-semibold tabular-nums"
            style={{ color: inSky ? "currentColor" : worst.category.color, opacity: inSky ? 1 : undefined }}
            title={`AQI ${worst.aqi} ${worst.category.name} (${worst.parameter}), observed in ${worst.reportingArea}`}
          >
            <Wind className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
            AQI {worst.aqi}
          </span>
        </>
      )}
      {showComfort && metar && (
        <>
          <span aria-hidden style={{ color: sepColor, opacity: sepOpacity }}>
            ·
          </span>
          <span
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: inSky ? "currentColor" : comfort.color, opacity: inSky ? 1 : undefined }}
            title={`Dewpoint ${metar.dewpointF}°F at KFDK, ${comfort.label.toLowerCase()}`}
          >
            <Droplets className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
            {comfort.label}
          </span>
        </>
      )}
    </footer>
  );
}
