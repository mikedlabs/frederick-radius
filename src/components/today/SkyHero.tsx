/**
 * Time-of-day animated sky behind the Today hero — now also tinted by
 * the current weather so a rainy 8am doesn't get the same vibrant
 * peach sunrise as a clear 8am. The base palette is hour-driven; the
 * weather "mood" mixes a tint into all three stops.
 *
 * Server-rendered: hour comes from America/New_York and weather is the
 * cached NWS hourly forecast (same fetch as AdaptiveGreeting; Next's
 * fetch cache dedupes the call).
 */

import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

export type SkyTone = "light" | "dark";
type Sky = { top: string; mid: string; bottom: string; tone: SkyTone };

type SkyMood = "clear" | "partly" | "cloudy" | "rain" | "storm" | "fog" | "snow";

/**
 * Server-safe helper for the current Eastern-time hour's sky tone.
 * Exposed so other components rendered alongside SkyHero (e.g.
 * WeeklyForecast tucked into the hero region) can color-match
 * without re-deriving the hour. Mirrors paletteForHour's tone tier.
 */
export function currentSkyTone(now: Date = new Date()): SkyTone {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
    10,
  );
  return paletteForHour(h).tone;
}

function paletteForHour(h: number): Sky {
  // Pre-dawn (3–5)
  if (h >= 3 && h < 6) return { top: "#1B1E3A", mid: "#2E3258", bottom: "#5C4F6E", tone: "dark" };
  // Sunrise (6–7)
  if (h >= 6 && h < 8) return { top: "#F5C28C", mid: "#F08770", bottom: "#B85C8B", tone: "light" };
  // Morning (8–10)
  if (h >= 8 && h < 11) return { top: "#A8D8F0", mid: "#C7E5F2", bottom: "#F0E8D8", tone: "light" };
  // Midday (11–14)
  if (h >= 11 && h < 15) return { top: "#7CB9E8", mid: "#A8D0EE", bottom: "#E8E4D5", tone: "light" };
  // Afternoon (15–17)
  if (h >= 15 && h < 18) return { top: "#7CA8D8", mid: "#D8B888", bottom: "#E5C99A", tone: "light" };
  // Golden hour (18–19)
  if (h >= 18 && h < 20) return { top: "#D88860", mid: "#E8A878", bottom: "#F5C898", tone: "light" };
  // Twilight (20–21)
  if (h >= 20 && h < 22) return { top: "#3D3460", mid: "#7A5680", bottom: "#C97B7B", tone: "dark" };
  // Night (22–2)
  return { top: "#0F1428", mid: "#1F2444", bottom: "#3A3458", tone: "dark" };
}

/** NWS shortForecast → high-level mood we can paint with. */
function moodFromConditions(s: string, precip: number): SkyMood {
  const cond = (s || "").toLowerCase();
  if (/thunderstorm|t-?storm|severe/.test(cond)) return "storm";
  if (/fog|mist|haze/.test(cond)) return "fog";
  if (/snow|sleet|flurr|wintry|ice/.test(cond)) return "snow";
  // Anything with rain/showers/drizzle in the forecast triggers a
  // rainy sky, even when hedged ("Chance Rain Showers"). AdaptiveGreeting
  // hedges its copy ("rainy" vs "chance of rain") so it doesn't claim
  // active rain falsely — but the sky just needs to FEEL like the
  // weather outside, and "rain in the description" is the right signal.
  if (/\b(rain|showers?|drizzle)\b/.test(cond) || precip >= 40) return "rain";
  if (/overcast|mostly cloudy|cloudy/.test(cond)) return "cloudy";
  if (/partly|mostly sunny|few clouds/.test(cond)) return "partly";
  // Default if conditions string is empty or unrecognized: keep base.
  return "clear";
}

/** Parse #RRGGBB to a [r,g,b] triple in 0..255. Loose — assumes valid. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
function rgbToHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
}
function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

/**
 * Apply the weather mood to the time-of-day palette. Each mood has a
 * tint color we mix into all three stops at a strength. Clear/partly
 * leave the base palette alone (the time-of-day vibe wins on a nice
 * day); rain/storm/fog/snow pull the sky toward their characteristic
 * mood color.
 */
function applyMood(sky: Sky, mood: SkyMood): Sky {
  // Tint hex + how strongly to mix the base toward it.
  const recipe: Record<SkyMood, { tint: string; t: number; tone?: SkyTone }> = {
    clear:   { tint: "#000000", t: 0 },
    partly:  { tint: "#9AA8B5", t: 0.12 },
    cloudy:  { tint: "#7A828C", t: 0.32 },
    rain:    { tint: "#3F526B", t: 0.42 },
    storm:   { tint: "#1F1B2B", t: 0.55, tone: "dark" },
    fog:     { tint: "#B6BCC4", t: 0.50 },
    snow:    { tint: "#D6DEE8", t: 0.32 },
  };
  const r = recipe[mood];
  if (r.t === 0) return sky;
  return {
    top: mixHex(sky.top, r.tint, r.t),
    mid: mixHex(sky.mid, r.tint, r.t),
    bottom: mixHex(sky.bottom, r.tint, r.t),
    tone: r.tone ?? sky.tone,
  };
}

export default async function SkyHero({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const nyHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
  const base = paletteForHour(nyHour);

  // Weather mood. Fetch is cached server-side; failure falls through
  // to the time-only palette so the page never blocks on NWS.
  let mood: SkyMood = "clear";
  try {
    const forecast = await getNwsForecast(FREDERICK_CENTER);
    const now0 = forecast?.hourly?.[0];
    if (now0) {
      mood = moodFromConditions(now0.shortForecast, now0.probabilityOfPrecipitation ?? 0);
    }
  } catch {
    // graceful: keep base palette
  }
  const sky = applyMood(base, mood);

  return (
    <section
      className={`sky-hero -mx-4 -mt-4 px-4 pb-8 pt-6 sm:rounded-b-[var(--app-radius-xl)] ${className}`}
      style={
        {
          "--sky-top": sky.top,
          "--sky-mid": sky.mid,
          "--sky-bottom": sky.bottom,
          color: sky.tone === "dark" ? "#F4F2EE" : "#1A1A1A",
        } as React.CSSProperties
      }
      data-sky-tone={sky.tone}
      data-sky-mood={mood}
    >
      {children}
    </section>
  );
}
