/**
 * The /today masthead is time-aware: its title and one-line frame change
 * with the Eastern daypart, so the page's identity matches the reorder the
 * page already performs. Before this, the title read a static "Today in
 * Frederick County" at every hour, so the adaptive behavior was invisible
 * and the front door felt generic.
 *
 * Pure + unit-tested. The daypart comes from the one daypart clock in
 * src/lib/daypart.ts, so the masthead, the place shelf and the event program
 * name the same moment. The page ISRs every 300s, so a daypart boundary rolls
 * the masthead within minutes.
 *
 * The masthead photograph is chosen here too, by Eastern season and daypart,
 * from the owner's archive in public/images/seasons. Its credit is derived
 * from the archive's own geotag and capture time, never typed by hand, so an
 * October visit cannot be greeted by a June frame captioned as current.
 */
import AERIAL_MANIFEST from "@/../public/images/seasons/aerial-manifest.json";
import { currentSeason, type Season } from "@/lib/aerial";
import { daypart, type Daypart } from "@/lib/daypart";
import { FREDERICK_CENTER, haversineMeters } from "@/lib/geo";

export type TodayFrame = {
  /** The page's daypart-aware h1. */
  title: string;
  /** One honest sentence framing what the page leads with now. */
  sub: string;
};

/**
 * Map an Eastern daypart to the masthead frame.
 *
 *   morning  05:00-10:59  the day ahead
 *   midday   11:00-15:59  what is still ahead today
 *   evening  16:00-20:59  what is on tonight
 *   late     21:00-04:59  winding down; tomorrow is on deck
 */
export function todayFrame(part: Daypart): TodayFrame {
  switch (part) {
    case "morning":
      return {
        title: "This morning in Frederick County",
        sub: "See what is open and what is coming up.",
      };
    case "midday":
      return {
        title: "Midday in Frederick County",
        sub: "See what is open and what is still ahead.",
      };
    case "evening":
      return {
        title: "Tonight in Frederick County",
        sub: "See what is happening and what is still open.",
      };
    case "late":
      return {
        title: "Late in Frederick County",
        sub: "See what is still open before the night winds down.",
      };
  }
}

// ─── The masthead photograph ────────────────────────────────────────────

type ArchiveGeotag = {
  src: string;
  lat: number;
  lng: number;
  takenAt: string | null;
  season: Season;
};

const ARCHIVE_GEOTAGS = AERIAL_MANIFEST as ArchiveGeotag[];

/** A geotag this close to the downtown center is captioned "Downtown
 * Frederick". Every slot below sits inside it; the radius keeps a future
 * swap to an out-of-town frame from inheriting the downtown caption. */
export const DOWNTOWN_CAPTION_RADIUS_M = 800;

type MastheadSlot = {
  src: string;
  /** What the frame shows, checked by eye against the file, for alt text. */
  subject: string;
};

/**
 * One frame per Eastern season and daypart, each a landscape owner photo
 * whose light matches the hour. Late night uses the June 2019 downtown dusk
 * frame (owner preference) except in winter, where the New Year's Eve 2021
 * night frame keeps bare trees under a winter date.
 */
export const MASTHEAD_PHOTOS: Record<Season, Record<Daypart, MastheadSlot>> = {
  spring: {
    morning: {
      src: "/images/seasons/spring/016.jpg",
      subject: "Downtown Frederick's church spires at sunrise with pear trees in bloom",
    },
    midday: {
      src: "/images/seasons/spring/015.jpg",
      subject: "A fountain garden in Frederick seen from above",
    },
    evening: {
      src: "/images/seasons/spring/013.jpg",
      subject: "Carroll Creek Park in evening light with redbuds in bloom",
    },
    late: {
      src: "/images/seasons/spring/Frederick Night.jpg",
      subject: "Downtown Frederick from above at dusk",
    },
  },
  summer: {
    morning: {
      src: "/images/seasons/summer/024.jpg",
      subject: "A Carroll Creek fountain plaza seen from above in the morning",
    },
    midday: {
      src: "/images/seasons/summer/087.jpg",
      subject: "A downtown Frederick intersection seen from directly above",
    },
    evening: {
      src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
      subject: "Carroll Creek in Frederick at golden hour",
    },
    late: {
      src: "/images/seasons/spring/Frederick Night.jpg",
      subject: "Downtown Frederick from above at dusk",
    },
  },
  fall: {
    morning: {
      src: "/images/seasons/fall/016.jpg",
      subject: "Fall maples and downtown Frederick's spires under a morning sky",
    },
    midday: {
      src: "/images/seasons/fall/043.jpg",
      subject: "A Carroll Creek footbridge among fall maples seen from above",
    },
    evening: {
      src: "/images/seasons/fall/FALL COLORS.jpg",
      subject: "Downtown Frederick in fall color at sunset",
    },
    late: {
      src: "/images/seasons/spring/Frederick Night.jpg",
      subject: "Downtown Frederick from above at dusk",
    },
  },
  winter: {
    morning: {
      src: "/images/seasons/winter/006.jpg",
      subject: "A downtown Frederick corner with holiday lights at dawn",
    },
    midday: {
      src: "/images/seasons/winter/WINTER COLOR.jpg",
      subject: "Downtown Frederick streets under fresh snow",
    },
    evening: {
      src: "/images/seasons/winter/001.jpg",
      subject: "Snowy downtown Frederick at sunset",
    },
    late: {
      src: "/images/seasons/winter/019.jpg",
      subject: "Downtown Frederick lit up at night",
    },
  },
};

const SEASON_WORD: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
};

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "long",
  year: "numeric",
});

export type ArchiveProvenance = {
  /** "Downtown Frederick" when the geotag supports it, else null. */
  place: string | null;
  /** "October 2024" from the capture time in Eastern, else null. */
  monthYear: string | null;
};

/** Where and when an archive frame was taken, from its own geotag. */
export function archiveProvenance(src: string): ArchiveProvenance {
  const tag = ARCHIVE_GEOTAGS.find((entry) => entry.src === src);
  if (!tag) return { place: null, monthYear: null };
  const nearDowntown =
    Number.isFinite(tag.lat) &&
    Number.isFinite(tag.lng) &&
    haversineMeters(FREDERICK_CENTER, { lat: tag.lat, lng: tag.lng }) <=
      DOWNTOWN_CAPTION_RADIUS_M;
  const taken = tag.takenAt ? new Date(tag.takenAt) : null;
  return {
    place: nearDowntown ? "Downtown Frederick" : null,
    monthYear:
      taken && Number.isFinite(taken.getTime()) ? MONTH_YEAR.format(taken) : null,
  };
}

/**
 * The credit chip: "Archive · Downtown Frederick · October 2024 · Mike D".
 * A part the archive cannot support is left out; with neither place nor date
 * the chip falls back to the season ("Archive · Fall · Mike D").
 */
export function archivePhotoCredit(src: string, season: Season): string {
  const { place, monthYear } = archiveProvenance(src);
  const parts = ["Archive"];
  if (place) parts.push(place);
  if (monthYear) parts.push(monthYear);
  if (!place && !monthYear) parts.push(SEASON_WORD[season]);
  parts.push("Mike D");
  return parts.join(" · ");
}

export type MastheadPhoto = {
  src: string;
  alt: string;
  credit: string;
  season: Season;
  daypart: Daypart;
};

/** The masthead frame for this Eastern season and daypart. */
export function todayMastheadPhoto(now: Date = new Date()): MastheadPhoto {
  const season = currentSeason(now);
  const part = daypart(now);
  const slot = MASTHEAD_PHOTOS[season][part];
  const { monthYear } = archiveProvenance(slot.src);
  return {
    src: slot.src,
    alt: `${slot.subject}${monthYear ? ` in ${monthYear}` : ""}, photographed by Mike D.`,
    credit: archivePhotoCredit(slot.src, season),
    season,
    daypart: part,
  };
}

// ─── The dateline inside the photo band ──────────────────────────────────

/**
 * The current-conditions phrase that follows the dateline in the band
 * ("48° and clear"). It reads the first NWS hourly period, the same reading
 * the weather card leads with, and returns null rather than guess when that
 * reading is missing. Unknown phrasing keeps the temperature alone.
 */
export function mastheadWeatherPhrase(
  temperature: number | null | undefined,
  shortForecast: string | null | undefined,
): string | null {
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) return null;
  const temp = `${Math.round(temperature)}°`;
  const condition = conditionNow(shortForecast ?? "");
  return condition ? `${temp} ${condition}` : temp;
}

function conditionNow(shortForecast: string): string | null {
  const t = shortForecast.toLowerCase().trim();
  if (!t) return null;
  const precip = /thunder|t-?storm/.test(t)
    ? "storms"
    : /snow|sleet|flurr|wintry|freezing/.test(t)
      ? "snow"
      : /rain|shower|drizzle/.test(t)
        ? "rain"
        : null;
  if (precip) {
    if (/chance/.test(t)) return `with a chance of ${precip}`;
    if (/likely/.test(t)) return `with ${precip} likely`;
    return precip === "storms" ? "and stormy" : precip === "snow" ? "and snowy" : "and rainy";
  }
  if (/fog|mist/.test(t)) return "and foggy";
  if (/haz|smoke/.test(t)) return "and hazy";
  for (const phrase of [
    "mostly cloudy",
    "partly cloudy",
    "partly sunny",
    "mostly sunny",
    "mostly clear",
  ]) {
    if (t.includes(phrase)) return `and ${phrase}`;
  }
  if (/overcast/.test(t)) return "and overcast";
  if (/cloudy/.test(t)) return "and cloudy";
  if (/sunny/.test(t)) return "and sunny";
  if (/clear|fair/.test(t)) return "and clear";
  return null;
}
