import Link from "next/link";
import { Sunrise, ChevronRight } from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { compareForLead } from "@/lib/events/lead-rank";
import { isUtilityEvent } from "@/lib/event-kind";
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

  return (
    <section aria-label="Tomorrow" className="mt-4">
      <div
        className="rounded-[var(--app-radius-lg)] border px-4 py-3"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-edge), var(--app-hi)" }}
      >
        <div className="flex items-center gap-2">
          <Sunrise className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
            Tomorrow
          </p>
          {weatherLine && (
            <p className="ml-auto font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
              {weatherLine}
            </p>
          )}
        </div>
        {top ? (
          <Link
            href={`/events/${top.slug}`}
            className="tactile-interactive group mt-2 flex min-h-11 items-center gap-2"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-[15px] font-semibold leading-snug tracking-tight">
                {top.title}
              </span>
              {top.venue_name && (
                <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                  {top.venue_name}
                </span>
              )}
            </span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>
        ) : (
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            No major event is listed for tomorrow yet.{" "}
            <Link href="/events" className="font-semibold" style={{ color: "var(--app-brand-press)" }}>
              See what&rsquo;s on
            </Link>
            .
          </p>
        )}
      </div>
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
