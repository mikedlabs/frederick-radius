import { FAIR_START_DATE, FAIR_END_DATE, FAIR_DAYS } from "./fair";
import { easternWallToUtcISO } from "@/lib/tz";

export type MajorEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  hype_days: number;
  theme_color: string;
  icon: string; // Emoji
  url: string;
  getHypeHeadline: (daysOut: number) => string;
  getHypeSubline: (daysOut: number) => string;
  getLiveHeadline: (now: Date) => string;
  getLiveSubline: (now: Date) => string;
  getLiveDetails?: (now: Date) => string[];
};

// Use the same timezone utility to ensure accurate comparisons
const iso = (y: number, m: number, d: number, h = 0, min = 0) =>
  easternWallToUtcISO(y, m, d, h, min);

export const MAJOR_EVENTS: MajorEvent[] = [
  {
    id: "great-frederick-fair",
    title: "The Great Frederick Fair",
    starts_at: FAIR_START_DATE,
    ends_at: FAIR_END_DATE,
    hype_days: 30, // 30 days hype for the fair
    theme_color: "var(--app-brand)",
    icon: "🎡",
    url: "/fair",
    getHypeHeadline: (daysOut) =>
      `The Great Frederick Fair starts in ${daysOut} day${daysOut === 1 ? "" : "s"}!`,
    getHypeSubline: () => "Tap to explore the full guide, map, and schedules.",
    getLiveHeadline: (now) => {
      const todayStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const [month, day, year] = todayStr.split("/");
      const ymd = `${year}-${month}-${day}`;
      const fairDay = FAIR_DAYS.find((d) => d.date === ymd) || FAIR_DAYS[0];
      return `Tonight: ${fairDay.grandstand_headline}`;
    },
    getLiveSubline: (now) => {
      const todayStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const [month, day, year] = todayStr.split("/");
      const ymd = `${year}-${month}-${day}`;
      const fairDay = FAIR_DAYS.find((d) => d.date === ymd) || FAIR_DAYS[0];
      return `${fairDay.theme} • ${fairDay.admission_special}`;
    },
    getLiveDetails: (now) => {
      const todayStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const [month, day, year] = todayStr.split("/");
      const ymd = `${year}-${month}-${day}`;
      const fairDay = FAIR_DAYS.find((d) => d.date === ymd);
      if (!fairDay) return [];
      
      return [
        fairDay.theme,
        `Grandstand: ${fairDay.grandstand_headline} at ${fairDay.grandstand_time}`,
        fairDay.admission_special
      ];
    },
  },
  {
    id: "in-the-streets",
    title: "In the Streets",
    starts_at: iso(2026, 9, 12, 11, 0),
    ends_at: iso(2026, 9, 12, 21, 0),
    hype_days: 14,
    theme_color: "var(--app-accent)",
    icon: "🎉",
    url: "/events",
    getHypeHeadline: (daysOut) =>
      `In the Streets is in ${daysOut} day${daysOut === 1 ? "" : "s"}!`,
    getHypeSubline: () => "Downtown's biggest block party is coming.",
    getLiveHeadline: () => "In the Streets is happening today!",
    getLiveSubline: () => "Market St is closed to cars. Live music, food, and fun.",
    getLiveDetails: () => [
      "9:00 AM: Market Street Mile",
      "11:00 AM: Festival Opens",
      "12:00 PM: Craft Beverage Experience",
      "12:30 PM: Time Capsule Sealing at City Hall",
      "5:00 PM: Up The Creek After-Party"
    ],
  },
  {
    id: "festival-of-the-arts",
    title: "Frederick Festival of the Arts",
    starts_at: iso(2026, 6, 6, 10, 0),
    ends_at: iso(2026, 6, 7, 18, 0),
    hype_days: 14,
    theme_color: "var(--app-cool)",
    icon: "🎨",
    url: "/events",
    getHypeHeadline: (daysOut) =>
      `Festival of the Arts is in ${daysOut} day${daysOut === 1 ? "" : "s"}!`,
    getHypeSubline: () => "A weekend of fine art along Carroll Creek.",
    getLiveHeadline: () => "Festival of the Arts is this weekend!",
    getLiveSubline: () => "100+ artists, live music, and demos on the creek.",
  },
  {
    id: "color-on-the-creek",
    title: "Color on the Creek",
    starts_at: iso(2026, 6, 12, 18, 0),
    ends_at: iso(2026, 6, 14, 22, 0),
    hype_days: 7,
    theme_color: "var(--app-brand-2)",
    icon: "⛵",
    url: "/events",
    getHypeHeadline: (daysOut) =>
      `Color on the Creek launches in ${daysOut} day${daysOut === 1 ? "" : "s"}!`,
    getHypeSubline: () => "The illuminated sailboats return to Carroll Creek.",
    getLiveHeadline: () => "Color on the Creek is live!",
    getLiveSubline: () => "Walk Carroll Creek tonight to see the illuminated boats.",
  },
  {
    id: "kris-kringle-procession",
    title: "Kris Kringle Procession",
    starts_at: iso(2026, 12, 11, 18, 30),
    ends_at: iso(2026, 12, 11, 20, 0),
    hype_days: 21,
    theme_color: "var(--app-brand)",
    icon: "🎄",
    url: "/events",
    getHypeHeadline: (daysOut) =>
      `Kris Kringle Procession is in ${daysOut} day${daysOut === 1 ? "" : "s"}!`,
    getHypeSubline: () => "Get ready for a magical holiday evening in Downtown Frederick.",
    getLiveHeadline: () => "The Kris Kringle Procession is tonight!",
    getLiveSubline: () => "The procession begins at the corner of South Carroll and East Patrick streets.",
    getLiveDetails: () => [
      "6:30 PM: Procession Begins",
      "7:15 PM: Tree Lighting Ceremony at Baker Park",
      "8:00 PM: Photos with Santa",
    ],
  }
];

export function getActiveMajorEvent(now: Date): { event: MajorEvent; isLive: boolean; daysOut: number } | null {
  const nowMs = now.getTime();
  
  for (const event of MAJOR_EVENTS) {
    const startMs = new Date(event.starts_at).getTime();
    const endMs = new Date(event.ends_at).getTime();
    
    // Is it happening right now?
    if (nowMs >= startMs && nowMs <= endMs) {
      return { event, isLive: true, daysOut: 0 };
    }
    
    // Is it in the hype window?
    const msToStart = startMs - nowMs;
    const daysOut = Math.ceil(msToStart / (1000 * 60 * 60 * 24));
    
    if (daysOut > 0 && daysOut <= event.hype_days) {
      return { event, isLive: false, daysOut };
    }
  }
  
  return null;
}
