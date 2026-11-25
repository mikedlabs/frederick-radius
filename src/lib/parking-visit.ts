import { CITY_GARAGE_HOURLY_DOLLARS } from "@/data/parking-garages";
import { holidayOn, thanksgivingDate } from "@/lib/holidays";
import { easternParts } from "@/lib/tz";

export const STREET_HOLIDAYS_URL = "https://www.visitfrederick.org/downtown-frederick/parking/";
const STREET_HOLIDAYS = new Set(["New Year's Day", "Martin Luther King Jr. Day", "Presidents' Day",
  "Memorial Day", "Juneteenth", "Independence Day", "Labor Day", "Veterans Day", "Thanksgiving", "Christmas Day"]);

/** Two named North Market blocks in the City's published four-hour zone.
 * The posted $2 area ends at Third Street. Parking beyond two paid hours
 * uses the published two-hour extension, a second ParkMobile session. */
const SESSION_FEE = 0.50;
const UPPER_BLOCK_HOURLY = 2;
export const CHART_MAX_DOLLARS = 4 * UPPER_BLOCK_HOURLY + 2 * SESSION_FEE;
export const STAY_HOURS = [1, 2, 3, 4] as const;
export const ARRIVAL_HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

export function visitDates(start: string) {
  const first = new Date(start + "T12:00:00Z");
  const format = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date(first.getTime() + i * 86_400_000);
    return { key: date.toISOString().slice(0, 10), label: format.format(date) };
  });
}

/** Plan from the next available whole hour. After the last arrival option,
 * seed tomorrow morning while leaving today available in the date picker. */
export function nextParkingArrival(now: Date) {
  const nextHour = easternParts(now).hour + (now.getUTCMinutes() || now.getUTCSeconds() ? 1 : 0);
  return nextHour > 20 ? { hour: 8, dayOffset: 1 } : { hour: Math.max(8, nextHour), dayOffset: 0 };
}

export function visitHourLabel(hour: number) {
  return hour === 24 ? "midnight" : `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

export function parkingMoney(amount: number) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** Whole-hour arrivals between 8 AM and 8 PM keep all four options on
 * the same Frederick date and outside DST transitions. The largest possible
 * garage charge ($4) is below both the published $5 and $12 caps. */
export function parkingVisit(day: string, arrival: number, duration: typeof STAY_HOURS[number]) {
  const date = new Date(day + "T12:00:00Z");
  const weekday = date.getUTCDay();
  const year = date.getUTCFullYear();
  const thanksgiving = thanksgivingDate(year);
  const previousDay = new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10);
  const weekend = weekday === 6 || weekday === 0;
  // The City publishes an annual program from Thanksgiving through New Year's Day.
  // Available arrival times start at 8 AM, after the weekend program begins.
  const holidayWeekend = weekend && (day >= thanksgiving || day === `${year}-01-01`);
  const freeAll = day === thanksgiving || previousDay === thanksgiving || holidayWeekend;
  const holiday = holidayOn(date);
  const listedHoliday = holiday && STREET_HOLIDAYS.has(holiday.name);
  const freeStreet = freeAll || Boolean(listedHoliday && !holiday?.observed);
  let garageHours = 0;
  let streetHours = 0;
  for (let hour = arrival; hour < arrival + duration; hour++) {
    if (!freeAll && !(weekday === 0 && hour >= 8 && hour < 14)) garageHours++;
    if (!freeStreet && weekday !== 0 && hour >= 9 && hour < 18) streetHours++;
  }
  const sessions = Math.ceil(streetHours / 2);
  const fees = sessions * SESSION_FEE;
  // The street holiday list does not waive garage charges. A separate City
  // notice may set a holiday price. Do not quote a regular garage charge
  // or move a street waiver to an observed weekday without confirmation.
  const garageUnknown = !freeAll && listedHoliday && garageHours > 0;
  const streetUnknown = listedHoliday && holiday?.observed && streetHours > 0;
  return {
    garage: garageUnknown ? null : garageHours * CITY_GARAGE_HOURLY_DOLLARS,
    lowerStreet: streetUnknown ? null : streetHours + fees,
    upperStreet: streetUnknown ? null : streetHours * UPPER_BLOCK_HOURLY + fees,
    sessions, freeAll, freeStreet, observed: Boolean(streetUnknown),
  };
}
