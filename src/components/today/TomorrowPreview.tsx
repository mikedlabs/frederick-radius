import { Cloud, Search, ArrowRight } from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { compareForLead } from "@/lib/events/lead-rank";
import { isUtilityEvent } from "@/lib/event-kind";
import TomorrowSwipeStack from "./TomorrowSwipeStack";
import { easternDayKey } from "@/lib/tz";
import { isTomorrowPreviewTime, tomorrowDaytimeForecast } from "@/lib/today/tomorrow";
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/**
 * TomorrowPreview — the forward answer for a late-night visitor.
 *
 * Past ~9 PM (the "late" daypart, strictly on the Eastern clock) a spent day is
 * a dead end: most draws have ended and "what's worth your time right now" is
 * usually "sleep". This gives the night owl tomorrow's answer instead — the
 * day's top draw and the weather look — composed from data already in hand
 * (the unified events set + the NWS daily high). Renders nothing during the day,
 * so it costs the ordinary afternoon zero space. Honest: no number it can't
 * trace, no draw that isn't really on tomorrow.
 */
export default async function TomorrowPreview({ now, eventsPromise }: { now: Date; eventsPromise: EventsPromise }) {
  if (!isTomorrowPreviewTime(now)) return null; // strict clock gate — day renders nothing

  const { publicEvents } = await eventsPromise;
  const tomorrowKey = easternDayKey(new Date(now.getTime() + 24 * 3_600_000));
  const draws = publicEvents
    .filter((e) => easternDayKey(new Date(e.starts_at)) === tomorrowKey && !isUtilityEvent(e))
    .sort(compareForLead);
  const top = draws[0] ?? null;

  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const wx = tomorrowDaytimeForecast(forecast, now);

  // Nothing to promise → nothing to show (honest empty, never filler).
  if (!top && !wx) return null;

  const weatherLine = wx
    ? `Tomorrow's high is ${wx.temp}°${wx.shortForecast ? `, with ${shortCondition(wx.shortForecast)}` : ""}.`
    : null;

  // We will map up to 5 top draws into the swipe stack
  const cardColors = [
    { bg: "bg-indigo-500", text: "text-white" },
    { bg: "bg-rose-500", text: "text-white" },
    { bg: "bg-emerald-500", text: "text-white" },
    { bg: "bg-amber-500", text: "text-white" },
    { bg: "bg-cyan-500", text: "text-white" },
  ];

  const swipeCards = draws.slice(0, 5).map((draw, i) => {
    const color = cardColors[i % cardColors.length];
    return {
      id: `${draw.slug}-${i}`,
      title: draw.title,
      venue: draw.venue_name || "Frederick, MD",
      slug: draw.slug,
      colorClass: color.bg,
      textClass: color.text,
    };
  });

  return (
    <section data-today-plan-rest-content aria-label="Tomorrow" className="mt-4 overflow-hidden">
      <TomorrowSwipeStack cards={swipeCards} weatherLine={weatherLine} />
    </section>
  );
}

/** A concise, honest read of a verbose NWS daily condition ("Chance Showers And
 *  Thunderstorms Then Showers Likely" → "storms around"), so the preview line
 *  stays one calm clause. Falls back to a lowercased first phrase. */
function shortCondition(sf: string): string {
  const t = sf.toLowerCase();
  if (/thunder|t-?storm|severe/.test(t)) return "storms possible";
  if (/snow|sleet|flurr|wintry|ice/.test(t)) return "wintry weather possible";
  if (/rain|shower|drizzle/.test(t)) return "rain possible";
  if (/fog|mist|haz/.test(t)) return "fog or haze";
  if (/overcast|mostly cloudy/.test(t)) return "mostly cloudy skies";
  if (/partly (sunny|cloudy)/.test(t)) return "partly sunny skies";
  if (/cloud/.test(t)) return "some clouds";
  if (/sunny/.test(t)) return "mostly sunny skies";
  if (/clear|fair/.test(t)) return "clear skies";
  // Unknown phrasing: first clause before a "then", lowercased.
  return t.split(/\s+then\s+/)[0].trim();
}
