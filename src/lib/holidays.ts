/**
 * US federal holidays — the ones with real, county-wide impact (banks, post
 * offices, courts, and most government offices closed; trash + transit often
 * shift). This is honest civic context for /today, not a calendar of every
 * observance: we surface only days a Frederick resident actually plans around.
 *
 * Pure + deterministic + unit-tested. Dates are computed (nth-weekday and
 * fixed-date with the standard Saturday→Friday / Sunday→Monday observed shift),
 * never hand-listed per year, so this needs no maintenance. Eastern calendar
 * day via easternParts, so a late-evening UTC instant lands on the right day.
 */
import { easternParts } from "@/lib/tz";

export type Holiday = {
  name: string;
  /** Factual, one-line closure implication for the county. */
  closures: string;
  /** True when today is the OBSERVED day for a holiday that fell on a weekend
   *  (e.g. July 4 on a Saturday → observed Friday the 3rd). */
  observed?: boolean;
};

const FEDERAL_CLOSURES = "Banks, post offices, and most government offices are closed.";
const MAJOR_CLOSURES = "Most businesses, banks, and government offices are closed.";

/** Day-of-month (1-based) of the nth given weekday in a month. month0 is
 *  0-based; weekday is 0=Sun…6=Sat; n is 1-based. */
function nthWeekday(year: number, month0: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const offset = (weekday - first + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/** Day-of-month of the LAST given weekday in a month (for Memorial Day). */
function lastWeekday(year: number, month0: number, weekday: number): number {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month0, lastDay)).getUTCDay();
  return lastDay - ((lastDow - weekday + 7) % 7);
}

type Spec = { name: string; closures: string };

/** The {month0, day} → Spec table for a year, including the observed-day
 *  entries for fixed-date holidays that fall on a weekend. */
function holidayTable(year: number): Map<string, Holiday> {
  const map = new Map<string, Holiday>();
  const key = (m0: number, d: number) => `${m0}-${d}`;

  const fixed = (m0: number, d: number, spec: Spec) => {
    map.set(key(m0, d), { name: spec.name, closures: spec.closures });
    // Observed shift: Sat → Fri (prior day), Sun → Mon (next day). Only keep
    // shifts that stay inside THIS year; a New Year's Day shifting back to
    // Dec 31 is added to that year's table by the forward rule below.
    const dow = new Date(Date.UTC(year, m0, d)).getUTCDay();
    const shift = dow === 6 ? -1 : dow === 0 ? 1 : 0;
    if (shift !== 0) {
      const o = new Date(Date.UTC(year, m0, d + shift));
      if (o.getUTCFullYear() === year) {
        map.set(key(o.getUTCMonth(), o.getUTCDate()), { name: spec.name, closures: spec.closures, observed: true });
      }
    }
  };
  const floating = (m0: number, day: number, spec: Spec) => {
    map.set(key(m0, day), { name: spec.name, closures: spec.closures });
  };

  fixed(0, 1, { name: "New Year's Day", closures: MAJOR_CLOSURES });
  floating(0, nthWeekday(year, 0, 1, 3), { name: "Martin Luther King Jr. Day", closures: FEDERAL_CLOSURES });
  floating(1, nthWeekday(year, 1, 1, 3), { name: "Presidents' Day", closures: FEDERAL_CLOSURES });
  floating(4, lastWeekday(year, 4, 1), { name: "Memorial Day", closures: FEDERAL_CLOSURES });
  fixed(5, 19, { name: "Juneteenth", closures: FEDERAL_CLOSURES });
  fixed(6, 4, { name: "Independence Day", closures: MAJOR_CLOSURES });
  floating(8, nthWeekday(year, 8, 1, 1), { name: "Labor Day", closures: FEDERAL_CLOSURES });
  floating(9, nthWeekday(year, 9, 1, 2), { name: "Indigenous Peoples' Day", closures: FEDERAL_CLOSURES });
  fixed(10, 11, { name: "Veterans Day", closures: FEDERAL_CLOSURES });
  floating(10, nthWeekday(year, 10, 4, 4), { name: "Thanksgiving", closures: MAJOR_CLOSURES });
  fixed(11, 25, { name: "Christmas Day", closures: MAJOR_CLOSURES });

  // NEXT year's New Year's Day, when Jan 1 falls on a Saturday, is observed on
  // Dec 31 of THIS year — the one holiday whose observed day crosses backward.
  if (new Date(Date.UTC(year + 1, 0, 1)).getUTCDay() === 6) {
    map.set(key(11, 31), { name: "New Year's Day", closures: MAJOR_CLOSURES, observed: true });
  }

  return map;
}

/** The federal holiday observed on the given instant's Eastern date, or null. */
export function holidayOn(date: Date): Holiday | null {
  const { year, month, day } = easternParts(date);
  return holidayTable(year).get(`${month - 1}-${day}`) ?? null;
}
