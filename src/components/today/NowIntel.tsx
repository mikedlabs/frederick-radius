import Link from "next/link";
import { Sun, Cloud, CloudRain } from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { weatherVerdict } from "@/lib/weather-verdict";
import { placesWithFieldHappyHour } from "@/lib/loaders/fieldNotes";
import { happyHourStatus } from "@/lib/happyHour";
import { isClosedNow } from "@/lib/hours";
// eslint-disable-next-line no-restricted-imports -- SERVER component (no "use client"): loader imports render server-side and never enter the client bundle
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { easternParts } from "@/lib/tz";
import { pickTonightEvent } from "@/lib/today/tonight";
import { composeRightNow, weatherPhrase, type RightNowClause } from "@/lib/today/right-now-line";
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/**
 * NowIntel — the composed "right now" line, in the gap between the weather hero
 * and the "I want…" grid.
 *
 * One calm orientation sentence fused from three live signals the page already
 * computes: a SHORT read of the sky (temp + condition + time of day — NOT the
 * hero's weather verdict, which this used to repeat verbatim; that duplicate was
 * the dead space the owner flagged), a live happy hour (named when it's the only
 * one), and tonight's headliner event. Composition, not generation —
 * composeRightNow holds the ordering + missing-signal fallbacks, and the render
 * assembles the clauses into flowing prose. Self-hides when there's nothing true
 * to say. Streamed in its own Suspense boundary so it never blocks the shell.
 */
export default async function NowIntel({ now, eventsPromise }: { now: Date; eventsPromise?: EventsPromise }) {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const cur = forecast?.hourly?.[0] ?? null;
  const weather =
    cur && forecast
      ? {
          phrase: weatherPhrase(cur.temperature, cur.shortForecast, now),
          tone: weatherVerdict({
            temp: cur.temperature,
            shortForecast: cur.shortForecast,
            precipNow: cur.probabilityOfPrecipitation ?? 0,
            hourly: forecast.hourly,
            now,
          }).tone,
        }
      : null;

  // Happy hours live right now — the count, and the venue name when there's only
  // one (so a single one reads "happy hour at Brewer's Alley", not a bare "1").
  const onNow = placesWithFieldHappyHour().filter((v) => {
    if (happyHourStatus(v.happy_hour.schedule, now).state !== "now") return false;
    // Not "on now" when the venue is provably closed (DQ-019).
    const p = clientPlaceBySlug(v.slug);
    return !(p && isClosedNow(p.hours, p.hours_verified ?? false, now));
  });
  const happy =
    onNow.length > 0
      ? { count: onNow.length, venue: onNow.length === 1 ? clientPlaceBySlug(onNow[0].slug)?.name ?? null : null }
      : null;

  // Tonight's headliner, from the SAME picker the SkyHero teaser + What's-On
  // feature use, so the line names the exact event the page leads with.
  let tonight: NonNullable<Parameters<typeof composeRightNow>[0]["tonight"]> | null = null;
  if (eventsPromise) {
    const { publicEvents } = await eventsPromise;
    const featured = pickTonightEvent(now, publicEvents);
    if (featured) {
      const startHour = easternParts(new Date(featured.starts_at)).hour;
      tonight = {
        title: featured.title,
        slug: featured.slug,
        venue: featured.venue_name ?? null,
        timeLabel: featured.is_all_day ? null : proseTime(featured.starts_at),
        isEvening: startHour >= 17,
      };
    }
  }

  const parts = composeRightNow({ weather, happy, tonight });
  if (parts.length === 0) return null;

  return (
    <p className="text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
      {parts.map((part, i) => (
        <span key={part.key}>
          {connector(parts, i)}
          {part.key === "weather" && (
            <span className="inline-flex items-baseline gap-1">
              <WeatherGlyph tone={part.tone} />
              {capFirst(part.text)}
            </span>
          )}
          {part.key === "happy" && (
            <Link href={part.href!} className="font-semibold" style={{ color: "var(--app-brand-press)" }}>
              {i === 0 ? capFirst(part.text) : part.text}
            </Link>
          )}
          {part.key === "tonight" && (
            <Link href={part.href!} className="font-medium" style={{ color: "var(--app-brand-2)" }}>
              {i === 0 ? capFirst(part.text) : part.text}
            </Link>
          )}
        </span>
      ))}
      {"."}
    </p>
  );
}

/** Grammatical connector before clause `i`: a semicolon after the sky read, an
 *  ", and" before the final clause of a pair, else a comma. Keeps the line a
 *  flowing sentence rather than a chip row. */
function connector(parts: RightNowClause[], i: number): string {
  if (i === 0) return "";
  if (parts[i - 1].key === "weather") return "; ";
  return i === parts.length - 1 ? ", and " : ", ";
}

/** The sky glyph, tinted by the verdict tone (rough/mixed/good). */
function WeatherGlyph({ tone }: { tone?: string }) {
  const Wx = tone === "rough" ? CloudRain : tone === "mixed" ? Cloud : Sun;
  const color =
    tone === "rough" ? "var(--app-warning)" : tone === "mixed" ? "var(--app-ink-3)" : "var(--app-accent)";
  return <Wx className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} aria-hidden style={{ color }} />;
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** A time the way a person reads it in prose: "5pm", "7:30pm" (Eastern). */
function proseTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour");
  const minute = get("minute");
  const ampm = get("dayPeriod").toLowerCase().replace(/\s/g, "");
  return minute === "00" ? `${hour}${ampm}` : `${hour}:${minute}${ampm}`;
}
