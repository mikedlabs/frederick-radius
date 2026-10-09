import type {
  CivicMoment,
  MomentDay,
  MomentSpotlightFact,
} from "@/data/civic-moments";
import { getTownPhoto, wikimediaUrl } from "@/lib/integrations/wikimedia";

/**
 * Pure helpers behind the moment hub template (src/components/moment) and the
 * Today spotlight. They decide which picture a moment may show and how its
 * days read, so the components only lay out what these return.
 */

/** Who took a licensed photograph, what it shows, and under which license. */
export type MomentPhotoCredit = {
  /** What the frame actually depicts ("Thurmont Town Square Park, the town center"). */
  depicts: string;
  author: string;
  license: string;
  /** The license deed, when the license has one. */
  licenseUrl: string | null;
  /** The file's page on Wikimedia Commons. */
  sourceUrl: string;
};

/**
 * The hero image ladder for a moment hub:
 * - `owned`: the owner's own photograph of the occasion. It may carry the
 *   title over an Ink scrim, because it shows the event itself.
 * - `licensed`: a credited Commons photograph of the town. It shows the
 *   place, not the event, so nothing is ever drawn on it.
 * - `none`: no photograph. The title sits on Cream.
 */
export type MomentHeroImage =
  | {
      kind: "owned";
      src: string;
      alt: string;
      credit: string;
      width: number;
      height: number;
    }
  | {
      kind: "licensed";
      src: string;
      alt: string;
      credit: MomentPhotoCredit;
    }
  | { kind: "none" };

const LICENSE_URLS: Record<string, string> = {
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC BY-SA 2.0": "https://creativecommons.org/licenses/by-sa/2.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "Public domain": "https://creativecommons.org/publicdomain/mark/1.0/",
};

/** The deed for a Commons license label, or null for an unknown label. */
export function licenseUrlFor(license: string): string | null {
  return LICENSE_URLS[license.trim()] ?? null;
}

/**
 * Pick the hero image for a moment. `width` sizes the Commons request; the
 * hero asks for a wide frame and the Today thumbnail for a small one.
 */
export function momentHeroImage(
  moment: Pick<CivicMoment, "spotlightImage" | "heroPhoto">,
  width = 1600,
): MomentHeroImage {
  if (moment.spotlightImage) {
    return { kind: "owned", ...moment.spotlightImage };
  }
  if (moment.heroPhoto) {
    const photo = getTownPhoto(moment.heroPhoto.townSlug);
    const depicts = moment.heroPhoto.depicts.trim();
    if (photo && depicts) {
      return {
        kind: "licensed",
        src: wikimediaUrl(photo.file, width),
        alt: photo.alt,
        credit: {
          depicts,
          author: photo.author,
          license: photo.license,
          licenseUrl: licenseUrlFor(photo.license),
          sourceUrl: photo.source_url,
        },
      };
    }
  }
  return { kind: "none" };
}

/** "Thurmont Town Square Park, the town center. Photo: CraigShipp.com Photos, CC BY-SA 2.0" */
export function momentPhotoCreditText(credit: MomentPhotoCredit): string {
  const depicts = credit.depicts.replace(/[.\s]+$/, "");
  return `${depicts}. Photo: ${credit.author}, ${credit.license}`;
}

export type MomentDayParts = {
  date: string;
  /** "Oct" */
  month: string;
  /** "10" */
  day: string;
  /** "Sat" */
  weekday: string;
  /** "Saturday, October 10, 2026", for assistive technology. */
  label: string;
};

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A civil date as a UTC noon instant, so no time zone can move its day. */
function civilDate(date: string): Date | null {
  const match = CIVIL_DATE.exec(date);
  if (!match) return null;
  const [, y, m, d] = match;
  const at = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  // Reject dates that roll over, such as 2026-02-31.
  if (at.getUTCMonth() !== Number(m) - 1 || at.getUTCDate() !== Number(d)) {
    return null;
  }
  return at;
}

function part(at: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(at);
}

/** The pieces a date plate prints for one moment day, or null if invalid. */
export function momentDayParts(date: string): MomentDayParts | null {
  const at = civilDate(date);
  if (!at) return null;
  return {
    date,
    month: part(at, { month: "short" }),
    day: part(at, { day: "numeric" }),
    weekday: part(at, { weekday: "short" }),
    label: part(at, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };
}

/** Valid moment days in calendar order, without duplicates. */
export function momentDays(days: readonly MomentDay[] | undefined): MomentDayParts[] {
  const seen = new Set<string>();
  return (days ?? [])
    .map((d) => momentDayParts(d.date))
    .filter((d): d is MomentDayParts => {
      if (!d || seen.has(d.date)) return false;
      seen.add(d.date);
      return true;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * The day a card should show: the first one on or after `todayKey` (an
 * Eastern YYYY-MM-DD), so Sunday's card never leads with Saturday. Without a
 * key it is the first day; once every day has passed it is the last.
 */
export function nextMomentDay(
  days: readonly MomentDayParts[],
  todayKey?: string,
): MomentDayParts | undefined {
  if (!todayKey) return days[0];
  return days.find((d) => d.date >= todayKey) ?? days[days.length - 1];
}

const DAY_MS = 86_400_000;

function consecutive(days: readonly MomentDayParts[]): boolean {
  for (let i = 1; i < days.length; i += 1) {
    const prev = civilDate(days[i - 1].date)!;
    const next = civilDate(days[i].date)!;
    if (next.getTime() - prev.getTime() !== DAY_MS) return false;
  }
  return true;
}

/**
 * The hero's date line and its spoken form. Consecutive days read as a
 * range ("OCT 10-11 · 2026"); separate days are listed ("OCT 10, 17 · 2026").
 * Returns null without valid days, because the spotlight window is not the
 * occasion's own dates.
 */
export function momentDateLine(
  days: readonly MomentDay[] | undefined,
): { text: string; label: string } | null {
  const parts = momentDays(days);
  if (parts.length === 0) return null;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const yearOf = (d: MomentDayParts) => d.date.slice(0, 4);
  const monthOf = (d: MomentDayParts) => d.date.slice(0, 7);
  const years =
    yearOf(first) === yearOf(last)
      ? yearOf(first)
      : `${yearOf(first)}-${yearOf(last)}`;
  const label = parts.map((d) => d.label).join(" and ");

  if (parts.length === 1) {
    return { text: `${first.month} ${first.day} · ${years}`.toUpperCase(), label };
  }
  const sameMonth = parts.every((d) => monthOf(d) === monthOf(first));
  if (consecutive(parts)) {
    const end = sameMonth ? last.day : `${last.month} ${last.day}`;
    return { text: `${first.month} ${first.day}-${end} · ${years}`.toUpperCase(), label };
  }
  const listed = parts
    .map((d, i) =>
      i > 0 && monthOf(d) === monthOf(parts[i - 1]) ? d.day : `${d.month} ${d.day}`,
    )
    .join(", ");
  return { text: `${listed} · ${years}`.toUpperCase(), label };
}

/**
 * Facts that name the page they came from. A moment tile never states a fact
 * without its source, so unsourced facts are dropped rather than shown.
 */
export function sourcedMomentFacts(
  facts: readonly MomentSpotlightFact[] | undefined,
): Array<MomentSpotlightFact & { source_url: string }> {
  return (facts ?? []).filter(
    (f): f is MomentSpotlightFact & { source_url: string } =>
      Boolean(
        f.label.trim() &&
          f.value.trim() &&
          f.source_url &&
          /^https?:\/\//.test(f.source_url),
      ),
  );
}

/** "colorfest.org" for a source link's visible text. */
/** In-page anchor id for a guide section heading ("Getting there" -> "getting-there"). */
export { momentSectionId } from "@/lib/events/momentSectionId";

/**
 * Directions to a moment venue. A venue with no car access gets walking
 * directions, so nobody is routed by car onto a road the organizer closed.
 */
export function momentDirectionsUrl(
  geom: { lng: number; lat: number },
  options: { walking?: boolean } = {},
): string {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${geom.lat},${geom.lng}`;
  return options.walking ? `${base}&travelmode=walking` : base;
}

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
