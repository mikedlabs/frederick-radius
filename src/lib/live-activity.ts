/**
 * Server-safe builder that turns server-fetched data into an Activity[]
 * for <LiveActivityPill>. The pill is a Client Component, so we MUST keep
 * this payload to plain serializable data (no function refs / components).
 */

import { ACCENTS } from "@/data/categories";
import { BRAND } from "@/lib/brand";
import { isEventLiveNow } from "@/lib/eventWhenLabel";

/**
 * True only when `now` falls inside a trustworthy event window. Missing,
 * invalid, equal, and end-of-day-sentinel ends fail closed: a guessed runtime
 * may keep an event discoverable elsewhere, but cannot support "Live now."
 */
export function isHappeningNow(
  starts_at: string,
  ends_at: string | null | undefined,
  now: Date,
): boolean {
  return isEventLiveNow({ starts_at, ends_at }, now);
}

export type ActivityIcon = "music" | "rain" | "alert" | "sparkles";

export type Activity = {
  id: string;
  kind: "live-event" | "weather" | "civic" | "upcoming";
  label: string;
  title: string;
  subtitle?: string;
  href: string;
  /** Hex color */
  accent: string;
  /** String key resolved to a Lucide component client-side */
  icon: ActivityIcon;
};

export function buildActivities({
  liveEvents,
  upcomingEvents,
  weather,
  civicAlertCount,
  now = new Date(),
}: {
  liveEvents: Array<{ slug: string; title: string; venue_name: string; starts_at?: string; ends_at?: string }>;
  upcomingEvents: Array<{ slug: string; title: string; venue_name: string; starts_at: string }>;
  weather?: { shortForecast: string; probabilityOfPrecipitation?: number; temperature: number };
  civicAlertCount?: number;
  /** Injected for testability and a single clock across the build. */
  now?: Date;
}): Activity[] {
  const list: Activity[] = [];

  for (const e of liveEvents.slice(0, 1)) {
    // Self-defensive: a "Live now" label must be temporal, not a
    // provenance guess. When the caller provides times, only label it
    // live if it is genuinely happening now. Provenance alone is never enough.
    if (!e.starts_at || !isHappeningNow(e.starts_at, e.ends_at, now)) continue;
    list.push({
      id: `live-${e.slug}`,
      kind: "live-event",
      label: "Live now",
      title: e.title,
      subtitle: `Happening at ${e.venue_name}`,
      href: `/events/${e.slug}`,
      accent: ACCENTS.terracotta,
      icon: "music",
    });
  }

  if (weather) {
    const precip = weather.probabilityOfPrecipitation ?? 0;
    const isWet = /rain|storm|shower|snow|sleet/i.test(weather.shortForecast);
    if (isWet && precip >= 40) {
      list.push({
        id: "weather-precip",
        kind: "weather",
        label: "Weather",
        title: `${weather.shortForecast} ahead`,
        subtitle: `${precip}% chance · plan indoor options`,
        href: "/",
        accent: ACCENTS.slate,
        icon: "rain",
      });
    }
  }

  if (civicAlertCount && civicAlertCount >= 5) {
    list.push({
      id: "civic-spike",
      kind: "civic",
      label: "Live conditions",
      title: `${civicAlertCount} active civic reports`,
      subtitle: "Updated by Frederick County FixIt",
      href: "/",
      accent: BRAND.colors.functionalAmber,
      icon: "alert",
    });
  }

  const nowMs = now.getTime();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const e of upcomingEvents) {
    const startMs = new Date(e.starts_at).getTime();
    const minutesUntil = Math.round((startMs - nowMs) / 60000);
    if (startMs > nowMs && startMs - nowMs <= TWO_HOURS) {
      list.push({
        id: `upcoming-${e.slug}`,
        kind: "upcoming",
        label: "Starting soon",
        title: e.title,
        subtitle: `${e.venue_name} · in ${minutesUntil} min`,
        href: `/events/${e.slug}`,
        accent: ACCENTS.amber,
        icon: "sparkles",
      });
      break;
    }
  }

  return list;
}
