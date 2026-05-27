/**
 * KFDK METAR — Frederick Municipal Airport surface observations.
 *
 * The NWS point forecast (lib/integrations/nws.ts) is what the rest of
 * the app reads for "what's the weather doing." METARs are the
 * complementary piece: real measured hourly observations from the
 * closest official weather station to downtown (KFDK sits ~2.5mi
 * southeast of Carroll Creek). The signal METARs add over the
 * regional forecast is DEWPOINT, which the NWS hourly response doesn't
 * expose cleanly. Dewpoint maps to comfort better than temperature
 * does: 72°F at 50°F dewpoint feels great; 72°F at 70°F dewpoint
 * feels oppressive.
 *
 * Public-domain US federal government data, no API key required.
 *
 * Activation:
 *   - Single hourly endpoint at aviationweather.gov, no auth.
 *   - Hourly refresh cadence matches the source (METARs publish once
 *     per hour, sometimes more during weather).
 *   - Failure is silent — getKfdkMetar() returns null and the caller
 *     just doesn't render the dewpoint chip.
 */

const KFDK_URL =
  "https://aviationweather.gov/api/data/metar?ids=KFDK&format=json&hours=1";

export type KfdkObservation = {
  /** Temperature in degrees Fahrenheit, rounded to the nearest whole. */
  tempF: number;
  /** Dewpoint in degrees Fahrenheit, rounded to the nearest whole. */
  dewpointF: number;
  /** Sustained wind speed in knots. */
  windSpeedKts: number | null;
  /** Wind direction in degrees (0-360). */
  windDirectionDeg: number | null;
  /** ICAO observation timestamp (raw, e.g. "2026-05-26T22:00:00Z"). */
  observedAt: string;
  /** Raw flight category if present (VFR / MVFR / IFR / LIFR). */
  flightCategory: string | null;
};

// The aviationweather.gov JSON response shape we actually consume. Many
// other fields exist (visibility, ceiling, raw METAR text, etc.); we
// pull only what feeds the comfort signal so a schema change to less
// important fields doesn't break this loader.
type KfdkRawObs = {
  temp?: number | null; // Celsius
  dewp?: number | null; // Celsius
  wspd?: number | null; // knots
  wdir?: number | null; // degrees
  reportTime?: string | null;
  obsTime?: number | null; // seconds since epoch (alternate field)
  fltcat?: string | null; // VFR / MVFR / IFR / LIFR
};

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

export async function getKfdkMetar(): Promise<KfdkObservation | null> {
  try {
    // Identify ourselves per NOAA's general expectation for API access.
    // No key required; this is just polite.
    const res = await fetch(KFDK_URL, {
      headers: {
        "User-Agent":
          process.env.NWS_USER_AGENT ??
          "FrederickRadius (contact: hello@frederickradius.app)",
        Accept: "application/json",
      },
      // METARs publish hourly; cache for 15 min so the page never blocks
      // on the network for the same response.
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as KfdkRawObs[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const m = data[0];
    if (typeof m.temp !== "number" || typeof m.dewp !== "number") return null;

    // observedAt: prefer the ISO `reportTime` if present, else convert
    // the epoch-seconds `obsTime` to ISO so the consumer always sees a
    // parseable string.
    const observedAt =
      m.reportTime ??
      (typeof m.obsTime === "number"
        ? new Date(m.obsTime * 1000).toISOString()
        : new Date().toISOString());

    return {
      tempF: cToF(m.temp),
      dewpointF: cToF(m.dewp),
      windSpeedKts: typeof m.wspd === "number" ? m.wspd : null,
      windDirectionDeg: typeof m.wdir === "number" ? m.wdir : null,
      observedAt,
      flightCategory: m.fltcat ?? null,
    };
  } catch {
    return null;
  }
}

export type DewpointComfort = {
  /** Editorial label safe for direct rendering. */
  label: "Very dry" | "Dry" | "Comfortable" | "Sticky" | "Muggy" | "Oppressive";
  /** Brand color token for the chip. */
  color: string;
  /** Whether to surface the chip. False for the "Comfortable" middle
   *  band — the signal is the EDGES of the comfort range, not the
   *  unremarkable middle. */
  worthSurfacing: boolean;
};

/**
 * Map dewpoint (°F) to an editorial comfort label, following the
 * widely-cited NWS / climatology bands:
 *
 *    < 30   Very dry (winter)
 *    30-50  Dry
 *    50-60  Comfortable
 *    60-65  Sticky
 *    65-70  Muggy
 *    > 70   Oppressive
 *
 * The chip is surfaced only at the edges of the spectrum where the
 * reader actually wants to know — comfortable middle is silent.
 */
export function dewpointComfort(dewpointF: number): DewpointComfort {
  if (dewpointF < 30) {
    return { label: "Very dry", color: "var(--app-cool)", worthSurfacing: true };
  }
  if (dewpointF < 50) {
    return { label: "Dry", color: "var(--app-ink-3)", worthSurfacing: false };
  }
  if (dewpointF < 60) {
    return { label: "Comfortable", color: "var(--app-positive)", worthSurfacing: false };
  }
  if (dewpointF < 65) {
    return { label: "Sticky", color: "var(--app-accent)", worthSurfacing: true };
  }
  if (dewpointF < 70) {
    return { label: "Muggy", color: "var(--app-warning)", worthSurfacing: true };
  }
  return { label: "Oppressive", color: "var(--app-danger)", worthSurfacing: true };
}
