/**
 * Server-safe builder that turns server-fetched data into an Activity[]
 * for <LiveActivityPill>. The pill is a Client Component, so we MUST keep
 * this payload to plain serializable data (no function refs / components).
 */

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
}: {
  liveEvents: Array<{ slug: string; title: string; venue_name: string }>;
  upcomingEvents: Array<{ slug: string; title: string; venue_name: string; starts_at: string }>;
  weather?: { shortForecast: string; probabilityOfPrecipitation?: number; temperature: number };
  civicAlertCount?: number;
}): Activity[] {
  const list: Activity[] = [];

  for (const e of liveEvents.slice(0, 1)) {
    list.push({
      id: `live-${e.slug}`,
      kind: "live-event",
      label: "Live now",
      title: e.title,
      subtitle: `Happening at ${e.venue_name}`,
      href: `/events/${e.slug}`,
      accent: "#C4451C",
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
        accent: "#2A5D8F",
        icon: "rain",
      });
    }
  }

  if (civicAlertCount && civicAlertCount >= 5) {
    list.push({
      id: "civic-spike",
      kind: "civic",
      label: "County pulse",
      title: `${civicAlertCount} active civic reports`,
      subtitle: "Updated by Frederick County FixIt",
      href: "/",
      accent: "#B26B00",
      icon: "alert",
    });
  }

  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const e of upcomingEvents) {
    const startMs = new Date(e.starts_at).getTime();
    const minutesUntil = Math.round((startMs - now) / 60000);
    if (startMs > now && startMs - now <= TWO_HOURS) {
      list.push({
        id: `upcoming-${e.slug}`,
        kind: "upcoming",
        label: "Starting soon",
        title: e.title,
        subtitle: `${e.venue_name} · in ${minutesUntil} min`,
        href: `/events/${e.slug}`,
        accent: "#D9A441",
        icon: "sparkles",
      });
      break;
    }
  }

  return list;
}
