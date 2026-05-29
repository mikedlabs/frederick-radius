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

// Two silhouette attempts have now been pulled from the SkyHero
// bottom edge:
//   1. RidgeLine (mountain horizon) — read as "wavy" instead of
//      mountains. Kept at ./RidgeLine.tsx for reference.
//   2. ClusteredSpires (downtown steeples) — the proportions read
//      phallic in the rendered version, not as architecture. Kept
//      at ./ClusteredSpires.tsx; if we revisit, a redesign needs
//      wider tower bases, stepped belfry → spire silhouettes, and
//      unambiguous cross finials (with horizontal arms) to break
//      the "tall narrow shape" read.
// The Frederick identity now lives in the COPY beats — the Monocacy
// / Catoctin sun anchors in AlmanacFooter, the Carroll Creek / Market
// Street / Catoctin trails proper nouns in BriefingLine. The sky
// ends in its own bottom color and the first card below overlaps
// cleanly into it (-mt-4 on the page wrapper).

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
  return currentSkyPalette(now).tone;
}

/**
 * Server-safe helper for the full current Eastern-time sky palette
 * (top / mid / bottom + tone). Exposed so adjacent surfaces — the
 * weather sub-card stack below SkyHero, alerts strips, etc. — can
 * pick up a faint echo of the same sky without re-deriving the
 * hour or the palette table.
 *
 * Note: this is the BASE time-of-day palette, NOT the weather-
 * mood-adjusted one. Adjacent surfaces want the time signal, not
 * the precipitation overlay (rain mood on a card stack would read
 * as a weird gray wash; sky doesn't have that problem because the
 * gradient is the whole canvas).
 */
export function currentSkyPalette(now: Date = new Date()): Sky {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
    10,
  );
  return paletteForHour(h);
}

function paletteForHour(h: number): Sky {
  // Sky-bottom colors used to fade to a near-paper-cream (#F0E8D8,
  // #E8E4D5, #E5C99A) so the gradient would "blend into" the page
  // below. The visible result was a milky band right above the
  // RidgeLine that read as snow on bright days — sky desaturating
  // before the ridge even arrives. Fix: keep the BOTTOM stop in the
  // sky family so the sky reads as sky all the way down to the
  // ridge. The RidgeLine (paper-cream silhouette) carries the
  // transition to the page bg; the sky no longer has to fake it.
  //
  // Pre-dawn (3–5)
  if (h >= 3 && h < 6) return { top: "#1B1E3A", mid: "#2E3258", bottom: "#5C4F6E", tone: "dark" };
  // Sunrise (6–7)
  if (h >= 6 && h < 8) return { top: "#F5C28C", mid: "#F08770", bottom: "#B85C8B", tone: "light" };
  // Morning (8–10) — was cream bottom; now a haze blue so the sky
  // doesn't dissolve into paper at the horizon.
  if (h >= 8 && h < 11) return { top: "#A8D8F0", mid: "#C7E5F2", bottom: "#B8D4E4", tone: "light" };
  // Midday (11–14) — was off-white; now a clear-sky horizon.
  if (h >= 11 && h < 15) return { top: "#7CB9E8", mid: "#A8D0EE", bottom: "#9CC5DD", tone: "light" };
  // Afternoon (15–17) — was a pale gold cream; now a warmer afternoon
  // haze that still reads as sky.
  if (h >= 15 && h < 18) return { top: "#7CA8D8", mid: "#B6C8DC", bottom: "#C9B687", tone: "light" };
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
  fill = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Cinematic fold: on mobile the sky grows to own most of the first
   *  screen (the 9:16 canvas), centering the weather glance in the
   *  gradient with a quiet scroll cue at the bottom edge. Resets to a
   *  normal-height block at lg+ so the desktop two-column layout is
   *  untouched. */
  fill?: boolean;
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

  // Celestial body — a soft sun (day) or moon (night) glow that ARCS
  // across the hero by the hour, so the hero quietly tells the time of
  // day. It's a blurred radial light, never a clip-art disc, so it
  // stays in the calm field-guide register. The sun rides the daytime
  // arc (low at 6/18, high at noon); after dusk a cooler moon glow sits
  // high. Heavy weather (rain/storm/fog) hides it — you can't see the
  // sun through a storm. Positions are 0–100% of the hero box.
  const celestial: "sun" | "moon" | "none" =
    mood === "rain" || mood === "storm" || mood === "fog"
      ? "none"
      : nyHour >= 6 && nyHour < 19
        ? "sun"
        : "moon";
  // Daytime arc: x runs 8%→92% from 6am→6pm; y dips to ~16% at noon and
  // rises to ~62% near the horizons. Night: a calm high moon.
  const dayT = Math.min(1, Math.max(0, (nyHour - 6) / 12));
  const sunX = 8 + dayT * 84;
  const sunY = 62 - (1 - Math.abs(dayT - 0.5) * 2) * 46;
  const celX = celestial === "moon" ? 74 : sunX;
  const celY = celestial === "moon" ? 24 : sunY;

  return (
    <section
      className={`sky-hero -mx-4 -mt-4 px-4 pb-3 pt-4 sm:rounded-b-[var(--app-radius-xl)] ${
        fill
          ? "flex min-h-[72svh] flex-col lg:!min-h-0 lg:block"
          : ""
      } ${className}`}
      style={
        {
          "--sky-top": sky.top,
          "--sky-mid": sky.mid,
          "--sky-bottom": sky.bottom,
          "--cel-x": `${celX}%`,
          "--cel-y": `${celY}%`,
          color: sky.tone === "dark" ? "#F4F2EE" : "#1A1A1A",
        } as React.CSSProperties
      }
      data-sky-tone={sky.tone}
      data-sky-mood={mood}
      data-celestial={celestial}
    >
      {/* Fine film grain — sits above the gradient + celestial light but
          below content, giving the sky real material texture instead of
          a flat CSS wash. The detail that reads as "crafted." */}
      <div aria-hidden className="sky-grain" />
      {/* Fill mode centers the weather glance in the tall sky (the
          Apple-Weather "city up top, temp in the field" composition);
          on lg the wrapper is inert so the desktop card layout holds. */}
      {fill ? (
        <div className="flex flex-1 flex-col justify-center lg:block">
          {children}
        </div>
      ) : (
        children
      )}

      {/* Scroll cue — a quiet, tone-aware chevron at the bottom of the
          fold that says "there's more below" without a label. Mobile
          only; the desktop layout shows the next sections inline. */}
      {fill && (
        <div
          aria-hidden
          className="mt-4 flex shrink-0 justify-center pb-1 opacity-60 lg:hidden"
        >
          <svg
            className="h-5 w-5 animate-bounce"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      )}
      {/* No silhouette mounted here right now. See the import-area
          comment for the history of attempts (mountains, spires).
          Frederick identity lives in the AlmanacFooter + BriefingLine
          copy until the silhouette gets a designed-from-scratch pass. */}
    </section>
  );
}
