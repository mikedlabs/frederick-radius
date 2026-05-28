import { PLACES } from "@/data/places";
import { allUpcoming, eventsLive } from "@/lib/loaders/events";
import { getOpenStatus } from "@/lib/hours";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

/**
 * BriefingLine — one-sentence synthesis sitting at the very top of
 * /now. Renames "data on screen" into "what should I do next."
 *
 * The review's central critique: the page shows accurate weather,
 * events, and places, but never says SO WHAT? This component answers
 * that for the next few hours in a single line.
 *
 * Rule-based on purpose (no AI dependency yet). The composer looks
 * at four signals every page render already has:
 *   - the current time-of-day window (morning / midday / afternoon
 *     / evening / late)
 *   - the NWS forecast — current temperature + conditions + the
 *     next 3 hours of precipitation chance, used to suggest indoor
 *     options when rain is incoming or muggy
 *   - how many curated places are open right now
 *   - the next event happening within ~5 hours, with a soonest-start
 *     priority over a more-featured-but-later event
 *
 * Output is intentionally small and quiet — a smart kicker line, not
 * a hero. The visual hero (SkyHero) still sits below it.
 */

type TimeBand = "morning" | "midday" | "afternoon" | "evening" | "late";

function timeBand(now: Date): TimeBand {
  // Frederick is America/New_York. Server-side we honor the wall
  // clock the user sees in Frederick, not the server's UTC hour.
  // toLocaleString with the IANA zone returns a parseable date.
  const local = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const h = local.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "midday";
  if (h >= 14 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "late";
}

function bandGreeting(band: TimeBand): string {
  switch (band) {
    case "morning":
      return "Good morning";
    case "midday":
      return "Midday";
    case "afternoon":
      return "Afternoon";
    case "evening":
      return "Tonight";
    case "late":
      return "Late tonight";
  }
}

/** Count places whose curated hours currently report open. Capped at
 *  the curated set so the count reflects places we trust enough to
 *  recommend, not the raw OSM long-tail. */
function openNowCount(now: Date): number {
  let n = 0;
  for (const p of PLACES) {
    if (p.source !== "seed" && p.source !== "manual") continue;
    if (!p.hours) continue;
    const status = getOpenStatus(p.hours, { verified: true }, now);
    if (status?.state === "open" || status?.state === "closing-soon") n++;
  }
  return n;
}

/** The single most useful event to NAME in the briefing. Priority:
 *  live-now events first, then the earliest event starting within
 *  the next 5 hours. */
function nextNotableEvent(now: Date) {
  const live = eventsLive(now);
  if (live.length > 0) return { event: live[0], live: true };
  const horizon = now.getTime() + 5 * 3600_000;
  const soon = allUpcoming(now)
    .filter((e) => {
      const t = Date.parse(e.starts_at);
      return Number.isFinite(t) && t > now.getTime() && t < horizon;
    })
    .sort(
      (a, b) =>
        Date.parse(a.starts_at) - Date.parse(b.starts_at),
    );
  return soon.length > 0 ? { event: soon[0], live: false } : null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Pick a weather fragment from the NWS forecast. Looks at the
 *  current period + the next 3 hours. Priorities:
 *    1. Incoming rain (next 3h precip ≥ 50%) → finish errands /
 *       indoor suggestion, with hours-to-rain when concrete
 *    2. Active rain / storm → indoor options
 *    3. Muggy + warm (>78°F + cloudy) → cool indoor + creek
 *    4. Cold + clear → trails read clean
 *    5. Beautiful baseline (mild + clear) → patio weather
 *  Returns null when nothing notable — the briefing doesn't need a
 *  weather line every single render.
 */
async function weatherFragment(): Promise<string | null> {
  const fc = await getNwsForecast(FREDERICK_CENTER);
  if (!fc || fc.hourly.length === 0) return null;
  const current = fc.hourly[0];
  if (!current) return null;

  const cond = current.shortForecast.toLowerCase();
  const temp = current.temperature;
  const isRaining = /rain|shower|drizzle|storm|thunder/i.test(cond);

  // Hours until precip chance crosses 50% in the next 3 periods.
  const ahead = fc.hourly.slice(1, 4);
  const rainSoonIdx = ahead.findIndex(
    (h) => (h.probabilityOfPrecipitation ?? 0) >= 50,
  );
  const hoursToRain = rainSoonIdx >= 0 ? rainSoonIdx + 1 : null;

  // Frederick-lexicon weather fragments — name actual landmarks so
  // the briefing reads as written FROM Frederick, not as generic
  // weather copy. Carroll Creek, Market Street, Catoctin, the
  // Monocacy, Baker Park are the recurring proper nouns. Each
  // fragment is short enough to glue to the rest of the briefing
  // with " · " on a phone line.
  if (isRaining) return "raining now — duck into a Market Street cafe";
  if (hoursToRain !== null && hoursToRain <= 2) {
    return `rain in ~${hoursToRain}h — finish on Market Street before it lands`;
  }
  // Muggy heuristic: warm + cloudy/overcast/hazy in summer.
  if (temp >= 78 && /cloud|overcast|haze|fog|humid/i.test(cond)) {
    return "muggy — Carroll Creek's shaded paths help by 4";
  }
  if (temp <= 45 && /clear|sunny|fair/i.test(cond)) {
    return "cold and clear — Catoctin trails will be photographer-quiet";
  }
  if (temp >= 60 && temp <= 80 && /clear|sunny|fair|partly/i.test(cond)) {
    return "patio weather — Carroll Creek's full of it";
  }
  return null;
}

export default async function BriefingLine() {
  const now = new Date();
  const band = timeBand(now);
  const openCount = openNowCount(now);
  const next = nextNotableEvent(now);
  const weather = await weatherFragment();

  // Compose. Each fragment is optional; we glue them with " · "
  // so the line stays human if one fragment isn't available.
  const greeting = bandGreeting(band);
  const fragments: string[] = [];

  // Weather leads (most contextually useful) when available.
  if (weather) fragments.push(weather);

  if (band === "morning" || band === "midday" || band === "afternoon") {
    if (openCount >= 3) {
      fragments.push(`${openCount} curated places open now`);
    }
  }

  if (next) {
    const { event, live } = next;
    if (live) {
      fragments.push(`${event.title} happening right now`);
    } else {
      const when = formatTime(event.starts_at);
      fragments.push(`${event.title} at ${when}`);
    }
  } else if ((band === "evening" || band === "late") && !weather) {
    fragments.push("a quiet night on the calendar");
  }

  // Nothing useful to add → don't render. The page is fine without us.
  if (fragments.length === 0) return null;

  return (
    <p
      className="text-[12px] font-medium leading-snug"
      style={{ color: "var(--app-ink-3)" }}
      aria-label="Daily briefing"
    >
      <span style={{ color: "var(--app-ink-2)" }}>{greeting}.</span>{" "}
      {fragments.join(" · ")}
    </p>
  );
}
