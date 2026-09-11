import type { DayOfWeek, Hours, HoursWindow } from "@/data/places";
import { isAllDayWindow } from "@/lib/hours";

const DAYS: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const MAX_UNREVIEWED_VISITABILITY_WINDOW_MINUTES = 20 * 60;

/**
 * A provider's "open 24 hours" value is not automatically a promise that a
 * person can walk in at any hour. It is commonly attached to parks, member-only
 * gyms, home-care phone lines, lodging, and emergency services. Those meanings
 * are too different for an "Open now" recommendation.
 *
 * Keep this list intentionally small and source-backed. Adding a slug requires
 * checking that the place itself is publicly visitable 24/7, not merely that a
 * phone line, members' entrance, fuel pump, or emergency response is available.
 */
export const REVIEWED_ALL_WEEK_24H_VISITABILITY = {
  "frederick-health-hospital": {
    reviewed_at: "2026-07-15",
    review_after: "2027-01-15",
    sources: ["https://www.frederickhealth.org/locations/frederick-health-hospital-hospital/"],
    note: "The official location page confirms 24/7 hospital and emergency access; individual departments keep their own hours.",
  },
  "4th-street-laundromat": {
    reviewed_at: "2026-07-15",
    review_after: "2027-01-15",
    sources: ["https://pickupmywash.com/contact"],
    note: "The owner's page says the self-service laundromat is open 24 hours a day, 365 days a year.",
  },
  "7-eleven-154": {
    reviewed_at: "2026-07-15",
    review_after: "2027-01-15",
    sources: ["https://www.7-eleven.com/locations/md/frederick/501-n-east-st-27643"],
    note: "The official page for this exact store lists it as open 24/7.",
  },
  "sheetz-thurmont": {
    reviewed_at: "2026-07-15",
    review_after: "2026-10-15",
    sources: [
      "https://orders.sheetz.com/findASheetz/store/200",
      "https://jobs.sheetz.com/DM-Toledo/jobs/71868?lang=en-us",
      "https://orders.sheetz.com/FAQ",
    ],
    note: "Official Store 200 and overnight customer-service sources confirm public overnight operation; recheck early because the job URL is temporary.",
  },
  "pennys-diner-brunswick": {
    reviewed_at: "2026-07-15",
    review_after: "2027-01-15",
    sources: ["https://pennysdiner.com/?p=146"],
    note: "The official Brunswick location page explicitly lists the diner as open 24/7.",
  },
  "rutters-75-walkersville": {
    reviewed_at: "2026-07-15",
    review_after: "2027-01-15",
    sources: ["https://www.rutters.com/amenities/24-hours/page/2/"],
    note: "Rutter's official 24-hour location listing includes Store 75 in Walkersville.",
  },
  "highs-woodsboro": {
    reviewed_at: "2026-07-15",
    review_after: "2026-10-15",
    sources: ["https://highs.com/highs-unveils-newly-remodeled-location/"],
    note: "High's official exact-location announcement calls Woodsboro a 24-hour operation; recheck early because the source is older.",
  },
  "exxon-myersville": {
    reviewed_at: "2026-07-15",
    review_after: "2027-01-15",
    sources: ["https://www.exxon.com/en/find-station/exxon-myersville-md-myersvilleexxon-200311650"],
    note: "Exxon's official exact-station page lists both the station and convenience store as open 24/7.",
  },
} as const;

export function isAllWeekAllDay(hours: Hours | undefined): boolean {
  if (!hours) return false;
  return DAYS.every((day) => {
    const windows = hours[day];
    return Boolean(windows?.some((window: HoursWindow) => isAllDayWindow(window)));
  });
}

function timeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 24 ||
    minutes < 0 ||
    minutes > 59 ||
    (hours === 24 && minutes !== 0)
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Provider schedules occasionally contain a single implausible window such as
 * "9:30 AM–5:30 AM" or one isolated "Open 24 hours" day. Those rows are just
 * as capable of creating a false open-now claim as an unreviewed seven-day
 * 24/7 schedule.
 *
 * Treat any window lasting at least 20 hours as review-required. The threshold
 * is deliberately conservative: ordinary long restaurant, retail, and venue
 * days still pass, while near-all-day claims remain silent until a first-party
 * source confirms public visitability.
 */
export function hasReviewRequiredExtendedWindow(
  hours: Hours | undefined,
): boolean {
  if (!hours) return false;
  return Object.values(hours).some((windows) =>
    windows?.some((window) => {
      const open = timeToMinutes(window.open);
      const close = timeToMinutes(window.close);
      if (open == null || close == null) return true;
      let duration = close - open;
      if (duration <= 0) duration += 24 * 60;
      return duration >= MAX_UNREVIEWED_VISITABILITY_WINDOW_MINUTES;
    }),
  );
}

export function is24hVisitabilityReviewCurrent(
  reviewAfter: string,
  now: Date = new Date(),
): boolean {
  return now.toISOString().slice(0, 10) <= reviewAfter;
}

export function hasReviewedAllWeek24hVisitability(
  slug: string,
  now: Date = new Date(),
): boolean {
  if (!Object.hasOwn(REVIEWED_ALL_WEEK_24H_VISITABILITY, slug)) return false;
  const entry = REVIEWED_ALL_WEEK_24H_VISITABILITY[
    slug as keyof typeof REVIEWED_ALL_WEEK_24H_VISITABILITY
  ];
  return is24hVisitabilityReviewCurrent(entry.review_after, now);
}

/**
 * Whether a schedule is safe to use for public hours and "Open now" claims.
 * Ordinary schedules pass through. Any near-all-day window, including an
 * all-week/all-day schedule, must have a current public-visitability review.
 */
export function mayPublishVisitabilityHours(
  slug: string,
  hours: Hours | undefined,
  now: Date = new Date(),
): boolean {
  const needsReview =
    isAllWeekAllDay(hours) || hasReviewRequiredExtendedWindow(hours);
  return !needsReview || hasReviewedAllWeek24hVisitability(slug, now);
}
