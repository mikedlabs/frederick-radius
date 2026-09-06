import Link from "next/link";
import { CloudSun, ParkingSquare, Utensils } from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  findHourlyAt,
  weatherPhrase,
  parkingPhrase,
  eatBeforePhrase,
} from "@/lib/event-pairings";
import type { EventParkingDecision } from "@/lib/events/parking";

/**
 * EventSmartPairings — the "decision layer" card that sits high on
 * the event detail page. Synthesizes three signals into one row each:
 *
 *   ☀ Weather at the event start (NWS hourly)
 *   🅿 Closest city garage (the shared event parking decision)
 *   🍽 Eat before (nearbyFood[0])
 *
 * Why this exists
 *   The mobile review's strongest critique was: "the app shows
 *   information but doesn't reveal it." The data joins already exist
 *   (nearbyFood / nearbyParking arrays on the page; getNwsForecast
 *   for weather), but they're scattered as separate sections at the
 *   bottom. This component is the connective tissue — one editorial
 *   card that turns four data sources into three lines a human can
 *   actually decide on.
 *
 *   The card uses local Frederick-anchored copy ("Rain expected at
 *   start" vs "60% chance of precipitation") because the reviewer's
 *   second point was: the page should feel like Frederick wrote it,
 *   not like a weather app printing values.
 *
 * Server component. NWS is server-fetched, cached via Next's fetch
 * dedupe, fails soft → the weather row simply doesn't render. Other
 * rows render independently. If ALL three are silent the whole card
 * returns null — we never ship empty chrome.
 */
export default async function EventSmartPairings({
  event,
  nearbyFood,
  parkingDecision,
}: {
  event: {
    starts_at: string;
    geom: { lng: number; lat: number };
  };
  nearbyFood: PlaceCardData[];
  parkingDecision: EventParkingDecision | null;
}) {
  const startsAt = new Date(event.starts_at);
  // Server component: request-time clock is correct here. Reading
  // Date.now() once and reusing keeps the window bounds consistent
  // across the two comparisons below.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const inForecastWindow =
    Number.isFinite(startsAt.getTime()) &&
    startsAt.getTime() - nowMs < 7 * 24 * 60 * 60 * 1000 &&
    startsAt.getTime() > nowMs - 60 * 60 * 1000;

  // Only fetch NWS for events inside the hourly forecast window. A
  // 6-month-out concert request would just waste the API call.
  const forecast = inForecastWindow
    ? await getNwsForecast(event.geom).catch(() => null)
    : null;

  const weather = weatherPhrase(findHourlyAt(forecast, startsAt));
  const parking = parkingPhrase(parkingDecision);
  const eat = eatBeforePhrase(nearbyFood);

  // Don't render empty chrome — if every synthesis returned null,
  // the page is fine without us.
  if (!weather && !parking && !eat) return null;

  return (
    <section
      aria-label="Around the event"
      className="rounded-[var(--app-radius-md)] border p-3.5"
      style={{
        borderColor: "var(--app-border)",
        background:
          "color-mix(in srgb, var(--app-brand) 5%, var(--app-bg-elevated))",
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Around the event
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {weather && (
          <li className="flex items-start gap-2.5 text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
            <CloudSun
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-brand)" }}
              aria-hidden
            />
            <span>{weather}<span className="mt-1 block text-[12px]" style={{ color: "var(--app-ink-3)" }}>National Weather Service{forecast?.asOf ? ` · issued ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(forecast.asOf))}` : " · issue time unavailable"}</span></span>
          </li>
        )}
        {parking && (
          <li className="flex items-start gap-2.5 text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
            <ParkingSquare
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-brand)" }}
              aria-hidden
            />
            <span>{parking}</span>
          </li>
        )}
        {eat && (
          <li className="flex items-start gap-2.5 text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
            <Utensils
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-brand)" }}
              aria-hidden
            />
            <span>{eat}{nearbyFood[0] && <Link href={`/places/${nearbyFood[0].slug}`} className="tap-44 flex w-fit items-center text-[12px] font-semibold underline" style={{ color: "var(--app-brand-press)" }}>Check hours &amp; details</Link>}</span>
          </li>
        )}
      </ul>
    </section>
  );
}
