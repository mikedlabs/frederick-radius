import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
  Moon,
  CloudMoon,
  Sunset as SunsetIcon,
  Sunrise as SunriseIcon,
} from "lucide-react";
import { getNwsForecast, iconForShortForecast, type NwsHourly } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { ACCENTS } from "@/data/categories";
import { sunTimes, FREDERICK_LAT, FREDERICK_LNG } from "@/lib/almanac";

const ICONS = {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
  Moon, CloudMoon,
} as const;

const TINT: Record<keyof typeof ICONS, string> = {
  Sun: "#E8A33D",
  CloudSun: "#C99632",
  Cloud: "#8A8884",
  CloudRain: ACCENTS.slate,
  CloudSnow: "#7CA8D8",
  CloudLightning: "#7E2C6F",
  CloudFog: "#9A9690",
  Wind: "#4A7CA8",
  Moon: "#5C6B8A",
  CloudMoon: "#6E7894",
};

/**
 * HourlyForecast — iOS Weather-style horizontal scroll card.
 *
 * Each hour is a narrow vertical cell: time / icon / temp. The first
 * cell reads "Now" instead of an hour label. When sunset (or sunrise)
 * falls within the 12-hour window, a Sun-event cell gets spliced into
 * the row at the right slot — the icon row reads "1 PM · 2 PM · Sunset
 * 8:23p · 3 PM · 4 PM …" the way the iOS card does it.
 *
 * Lives in its own paper-cream card on /now, BELOW the SkyHero, so the
 * hero stays focused on the headline conditions and the hourly is a
 * separate scrollable section. Replaces the old WeatherHourlyChart
 * (the SVG curve + scrub) which packed too much into one element and
 * fought the rest of the card.
 */

function hourLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  })
    .format(d)
    .toLowerCase()
    .replace(" ", "");
}

function sunClock(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(d)
    .replace(/\s?AM$/i, "a")
    .replace(/\s?PM$/i, "p");
}

type Cell =
  | { kind: "hour"; index: number; hour: NwsHourly; isNow: boolean }
  | { kind: "sun"; event: "sunset" | "sunrise"; time: Date };

/**
 * Splice sun-event cells into the hour list at their real chronological
 * position. The user gets a single time-ordered ribbon: hours + sunset
 * + (sometimes) sunrise, in actual time order.
 */
function buildCells(hours: NwsHourly[], now: Date): Cell[] {
  const cells: Cell[] = hours.map((h, i) => ({
    kind: "hour",
    index: i,
    hour: h,
    isNow: i === 0,
  }));

  const sun = sunTimes(now, FREDERICK_LAT, FREDERICK_LNG);
  if (!sun) return cells;

  // Window: from `now` to the last hour in the strip.
  const windowEnd = hours.length
    ? new Date(hours[hours.length - 1].startTime).getTime() + 60 * 60 * 1000
    : now.getTime();

  // Sun events that fall inside the visible window get spliced in.
  const events: Array<{ event: "sunset" | "sunrise"; time: Date }> = [];
  if (sun.sunset.getTime() > now.getTime() && sun.sunset.getTime() < windowEnd) {
    events.push({ event: "sunset", time: sun.sunset });
  }
  // After-dark visit: tomorrow's sunrise may fall in the window.
  const tomorrow = sunTimes(
    new Date(now.getTime() + 86_400_000),
    FREDERICK_LAT,
    FREDERICK_LNG,
  );
  if (tomorrow && tomorrow.sunrise.getTime() > now.getTime() && tomorrow.sunrise.getTime() < windowEnd) {
    events.push({ event: "sunrise", time: tomorrow.sunrise });
  }

  // Stable merge by time.
  const merged: Cell[] = [];
  let i = 0;
  let j = 0;
  while (i < cells.length || j < events.length) {
    const cellTime =
      i < cells.length
        ? new Date((cells[i] as { hour: NwsHourly }).hour.startTime).getTime()
        : Infinity;
    const eventTime = j < events.length ? events[j].time.getTime() : Infinity;
    if (cellTime <= eventTime) {
      merged.push(cells[i]);
      i++;
    } else {
      merged.push({ kind: "sun", event: events[j].event, time: events[j].time });
      j++;
    }
  }
  return merged;
}

export default async function HourlyForecast() {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const hours = forecast?.hourly?.slice(0, 12) ?? [];
  if (hours.length === 0) return null;

  const now = new Date();
  const cells = buildCells(hours, now);

  return (
    <article
      className="px-4 pb-3"
      aria-label={`Next ${hours.length} hours`}
    >
      {/* Outer card chrome (border + shadow + padding) and the
          "Hourly forecast" header BOTH stripped here — the parent
          HourlyDisclosure now provides the disclosure header, and
          this component sits flat inside the consolidated weather
          panel so it shares the panel's border/shadow/rounding
          instead of double-bordering. */}

      {/* Horizontal scroll. -mx-4 + px-4 lets the rail edge-fade past
          the panel's padding the way the iOS Weather card does. */}
      <div
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
      >
        <ol className="flex min-w-max gap-3">
          {cells.map((c, i) => {
            if (c.kind === "sun") {
              const SunIcon = c.event === "sunset" ? SunsetIcon : SunriseIcon;
              const label = c.event === "sunset" ? "Sunset" : "Sunrise";
              return (
                <li
                  key={`sun-${i}`}
                  className="flex w-[60px] shrink-0 flex-col items-center gap-1.5 py-1"
                  role="listitem"
                >
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wide tabular-nums"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {sunClock(c.time)}
                  </span>
                  <SunIcon
                    className="h-6 w-6"
                    strokeWidth={1.75}
                    style={{ color: "var(--app-accent)" }}
                    aria-hidden
                  />
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {label}
                  </span>
                </li>
              );
            }
            const k = iconForShortForecast(c.hour.shortForecast);
            const Icon = ICONS[k];
            const time = new Date(c.hour.startTime);
            return (
              <li
                key={`h-${c.index}`}
                className="flex w-[48px] shrink-0 flex-col items-center gap-1.5 py-1"
                role="listitem"
              >
                <span
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: c.isNow ? "var(--app-brand)" : "var(--app-ink-3)" }}
                >
                  {c.isNow ? "Now" : hourLabel(time)}
                </span>
                <Icon
                  className="h-6 w-6"
                  strokeWidth={1.75}
                  style={{ color: TINT[k] }}
                  aria-hidden
                />
                <span
                  className="text-[14px] font-semibold tabular-nums leading-none"
                  style={{ color: "var(--app-ink)" }}
                >
                  {c.hour.temperature}&deg;
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </article>
  );
}
