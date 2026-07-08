/**
 * The composed "right now" line for /today — the calm orientation sentence that
 * lands in the gap between the weather hero and the "I want…" grid.
 *
 * It answers "what's going on right now?" in one plain line by fusing signals the
 * page already has: a SHORT read of the sky (temperature + condition + time of
 * day — deliberately NOT the hero's weather verdict, which this used to repeat
 * verbatim), whether a happy hour is on, and tonight's headliner event. This is
 * COMPOSITION, not generation — every clause is a verified fact stated plainly,
 * in the calm-local register (docs/VOICE.md). No em dashes, counts subordinate.
 *
 * It degrades gracefully: drop any signal and the remaining clauses still read as
 * a true sentence; drop them all and it returns an empty list so the caller
 * renders nothing (honest empty, never filler).
 *
 * Pure + deterministic so the composition, the weather paraphrase, and the
 * missing-signal fallbacks are unit-tested directly.
 */
import type { VerdictTone } from "@/lib/weather-verdict";
import { daypart } from "@/lib/daypart";

export type RightNowClause = {
  /** Which signal this clause speaks — lets the renderer pick a glyph/link. */
  key: "weather" | "happy" | "tonight";
  /** The user-facing text, already voice-clean. */
  text: string;
  /** Where the clause taps to, when it links somewhere. */
  href?: string;
  /** Weather clause only — drives the sky glyph tint. */
  tone?: VerdictTone;
};

export type RightNowSignals = {
  /** A short sky read + its tone, or null when the forecast is unavailable. */
  weather: { phrase: string; tone: VerdictTone } | null;
  /** Happy hours live right now: how many, and the venue when it's the only one. */
  happy: { count: number; venue?: string | null } | null;
  /** Tonight's headliner, or null when nothing's still catchable today. */
  tonight: {
    title: string;
    slug: string;
    venue?: string | null;
    /** Prose time ("5pm") for a daytime headliner; ignored once `isEvening`. */
    timeLabel?: string | null;
    /** True when it starts in the evening — then the clause reads "… tonight". */
    isEvening: boolean;
  } | null;
};

/** Word-boundary clamp so a firehose event title never runs the line long. */
function clampTitle(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max).lastIndexOf(" ");
  return `${(cut > 8 ? t.slice(0, cut) : t.slice(0, max)).trimEnd()}…`;
}

const TEMP_ADJ: Array<[number, string]> = [
  [35, "cold"],
  [50, "chilly"],
  [64, "cool"],
  [78, "mild"],
  [88, "warm"],
];
function tempAdjective(temp: number): string {
  for (const [ceil, word] of TEMP_ADJ) if (temp < ceil) return word;
  return "hot";
}

/** One adjective for the sky, from the NWS shortForecast. "" when unknown. */
function skyWord(shortForecast: string): string {
  const t = shortForecast.toLowerCase();
  if (/thunder|t-?storm|severe/.test(t)) return "stormy";
  if (/snow|sleet|flurr|wintry|ice/.test(t)) return "snowy";
  if (/rain|shower|drizzle/.test(t)) return "wet";
  if (/fog|mist|haz/.test(t)) return "gray";
  if (/cloud|overcast/.test(t)) return "gray";
  if (/sun|clear|fair/.test(t)) return "clear";
  return "";
}

function daypartPhrase(now: Date): string {
  switch (daypart(now)) {
    case "morning":
      return "this morning";
    case "midday":
      return "this afternoon";
    case "evening":
      return "this evening";
    case "late":
      return "tonight";
  }
}

/**
 * A short, plain read of the sky for the orientation line — "Cool and gray this
 * morning", "Mild and clear this evening". Deliberately NOT the weather verdict
 * (the hero owns that); this is temperature + condition + time of day, so the two
 * surfaces complement instead of repeat. Capitalized (it leads the sentence).
 */
export function weatherPhrase(temp: number, shortForecast: string, now: Date): string {
  const adj = tempAdjective(temp);
  const sky = skyWord(shortForecast);
  const when = daypartPhrase(now);
  const lead = sky ? `${adj} and ${sky}` : adj;
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)} ${when}`;
}

/**
 * Compose the ordered clauses of the "right now" line. The sky read leads (it
 * orients), then the live happy hour and tonight's headliner. Order is fixed;
 * absent signals are skipped, so the sentence is always true for what's actually
 * happening. The caller assembles them into flowing prose with connectors.
 */
export function composeRightNow({ weather, happy, tonight }: RightNowSignals): RightNowClause[] {
  const parts: RightNowClause[] = [];

  if (weather && weather.phrase.trim()) {
    parts.push({ key: "weather", text: weather.phrase.trim(), tone: weather.tone });
  }

  if (happy && happy.count > 0) {
    const text =
      happy.count === 1 && happy.venue
        ? `happy hour at ${happy.venue}`
        : `${happy.count} happy hour${happy.count === 1 ? "" : "s"} on now`;
    parts.push({ key: "happy", text, href: "/happy-hour" });
  }

  if (tonight && tonight.title.trim()) {
    const title = clampTitle(tonight.title, 34);
    const place = tonight.venue ? ` at ${tonight.venue}` : "";
    const when = tonight.isEvening
      ? " tonight"
      : tonight.timeLabel
        ? tonight.venue
          ? `, ${tonight.timeLabel}`
          : ` at ${tonight.timeLabel}`
        : "";
    parts.push({ key: "tonight", text: `${title}${place}${when}`, href: `/events/${tonight.slug}` });
  }

  return parts;
}
