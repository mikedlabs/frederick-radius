import type { DayOfWeek, Hours, HoursDateException } from "../../src/data/places";
import type { MerchantHoursRecord, MerchantHoursSource } from "../../src/lib/merchant-hours";
import type { OfficialPageReceipt } from "./fcpl-official-hours";
import { QUALIFIED_HOURS_SOURCES } from "../../src/lib/qualified-hours-sources";

type QualifiedSchedule = { hours: Hours; qualification: NonNullable<MerchantHoursRecord["qualification"]>; exceptions?: HoursDateException[] };
const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
const visibleText = (element: Element) => normalized(element.textContent ?? "");
const CLOCK = "(\\d{1,2}(?::\\d{2})?\\s*[AP]M)";
const RANGE = `${CLOCK}\\s*[-–—]\\s*${CLOCK}`;
const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SLUGS = new Set<string>(QUALIFIED_HOURS_SOURCES.map((source) => source.slug));

function visible(element: Element) {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true" || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(node.getAttribute("style") ?? "")) throw Error("Qualified schedule identity and hours must be visible.");
  }
  return element;
}
function one(document: Document | Element, selector: string): Element {
  const elements = [...document.querySelectorAll(selector)];
  if (elements.length !== 1) throw Error("Missing or duplicate qualified source section.");
  return visible(elements[0]);
}
function exact(element: Element, pattern: RegExp) {
  const match = visibleText(visible(element)).match(pattern);
  if (!match) throw Error("Changed or incomplete qualified source evidence.");
  return match;
}
function time(value: string) {
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (!match || +match[1] < 1 || +match[1] > 12 || +(match[2] ?? 0) > 59) throw Error("Invalid qualified service clock.");
  return `${String(+match[1] % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${match[2] ?? "00"}`;
}
function assign(hours: Hours, days: DayOfWeek[], open: string, close: string) {
  const period = { open: time(open), close: time(close) };
  if (period.open >= period.close) throw Error("Unreviewed qualified overnight schedule.");
  for (const day of days) {
    if (hours[day]) throw Error("Duplicate qualified weekday.");
    hours[day] = [{ ...period }];
  }
}
function requirePhone(element: Element, phone: string) {
  const phones = visibleText(element).match(/(?<!\d)(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]\d{4}(?!\d)/g) ?? [];
  if (!phones.some(value => value.replace(/\D/g, "") === phone)) throw Error("Missing exact qualified source phone.");
}
function rejectStructuredHours(document: Document) {
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Object.keys(value).some(key => /^(?:openingHours|openingHoursSpecification|specialOpeningHoursSpecification)$/.test(key))) throw Error("Unreviewed structured qualified schedule.");
    Object.values(value).forEach(visit);
  };
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    let value: unknown;
    try { value = JSON.parse(script.textContent ?? ""); } catch { throw Error("Invalid structured qualified evidence."); }
    visit(value);
  }
}
function rejectNotices(text: string) {
  const unreviewed = text.replace(/Please note: our kitchen is closed on Saturday & Sunday from 2:45 p\.m\.\s*[-–—]\s*4:00 p\.m\. The restaurant is open for drinks only during this time\./g, "");
  if (/temporarily closed|closed (?:today|tomorrow|for\b|this\b|next\b|on (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))|closing early|special hours|holiday hours|reduced hours|hours (?:vary|may vary|subject to)|until sold out|by appointment/i.test(unreviewed)) throw Error("Unreviewed qualified closure or service notice.");
}
function gregorianEaster(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const offset = h + l - 7 * m + 114;
  return { month: Math.floor(offset / 31), day: offset % 31 + 1 };
}
/** Calendar calculations only detect a boundary requiring a new dated review.
 * They never manufacture an observed holiday exception or renew evidence.
 */
function holdAnnualClosureBoundary(slug: string, from: string, through: string) {
  const start = Date.parse(`${from}T12:00:00Z`), end = Date.parse(`${through}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 7 * 86_400_000) throw Error("Invalid qualified coverage window.");
  for (let stamp = start; stamp <= end; stamp += 86_400_000) {
    const date = new Date(stamp), month = date.getUTCMonth() + 1, day = date.getUTCDate(), weekday = date.getUTCDay();
    const common = (month === 1 && day === 1) || (month === 12 && [24, 25].includes(day)) || (month === 11 && weekday === 4 && day >= 22 && day <= 28);
    let boundary = common;
    if (slug === "hootch-and-banter-frederick") boundary ||= (month === 5 && weekday === 1 && day >= 25) || (month === 7 && day === 4) || (month === 9 && weekday === 1 && day <= 7);
    if (slug === "national-museum-civil-war-medicine-frederick") {
      const easter = gregorianEaster(date.getUTCFullYear());
      boundary ||= month === easter.month && day === easter.day;
    }
    if (boundary) throw Error("Annual closure boundary needs an explicit dated review.");
  }
}
function museum(document: Document): QualifiedSchedule {
  const cards = [...document.querySelectorAll("footer#footer .location-btn")].filter(card => card.querySelector("h5") && /^National Museum of Civil War Medicine$/.test(visibleText(card.querySelector("h5")!)));
  if (cards.length !== 1) throw Error("Missing or duplicate exact museum identity.");
  const card = visible(cards[0]);
  exact(one(card, ".address"), /^48 East Patrick Street Frederick, MD 21701$/);
  requirePhone(one(card, ".phone"), "3016951864");
  if (one(card, "a.location-btn-link").getAttribute("href") !== "/nmcwm/") throw Error("Changed museum location identity.");
  const match = exact(one(card, ".hours"), new RegExp(`^Regular Hours Monday\\s*[-–—]\\s*Saturday ${RANGE} Sunday ${RANGE} Last admittance to the galleries at ${CLOCK} Closed on New Year's Day, Easter, Thanksgiving, Christmas Eve, and Christmas Day\\.$`, "i"));
  if (time(match[5]) !== "16:00" || time(match[2]) !== "17:00" || time(match[4]) !== "17:00") throw Error("Changed museum admission qualification needs review.");
  if ([...document.querySelectorAll("strong")].filter(node => visibleText(node) === "Regular Hours").length !== 1) throw Error("Additional museum schedule needs review.");
  const hours: Hours = {};
  assign(hours, DAYS.slice(0, 6), match[1], match[2]); assign(hours, ["sun"], match[3], match[4]);
  return { hours, qualification: { scope: "venue", label: "Museum hours", note: "Gallery admission ends at 4 p.m. The museum closes at 5 p.m. The museum closes on New Year’s Day, Easter, Thanksgiving, Christmas Eve and Christmas Day.", usage: "display_only" } };
}
function tastingRoom(document: Document): QualifiedSchedule {
  const contact = one(document, "section#contact");
  exact(one(contact, "section.address p"), /^The Tasting Room 101 N\. Market Street Frederick, MD 21701$/);
  const phone = [...contact.querySelectorAll("p.tel")].filter(element => /^P \|/.test(visibleText(element)));
  if (phone.length !== 1) throw Error("Changed Tasting Room phone identity.");
  requirePhone(visible(phone[0]), "2403797772");
  const schedule = one(document, "section.hours");
  if (!contact.contains(schedule)) throw Error("Unbound Tasting Room schedule.");
  const rows = [...schedule.querySelectorAll(":scope > p")];
  if (rows.length !== 4) throw Error("Missing or additional Tasting Room weekdays.");
  const matches = [
    exact(rows[0], new RegExp(`^Monday\\s*[-–—]\\s*Thursday Happy Hour ${RANGE} \\[Monday ${RANGE}\\] Dinner ${RANGE} \\[Bar - 11:00\\]$`, "i")),
    exact(rows[1], new RegExp(`^Friday Happy Hour ${RANGE} Dinner ${RANGE} \\[Bar - 12:00\\]$`, "i")),
    exact(rows[2], new RegExp(`^Saturday Dinner ${RANGE} \\[Bar - 12:00\\]$`, "i")),
  ];
  exact(rows[3], /^Sunday Closed$/i);
  const hours: Hours = { sun: [] };
  assign(hours, DAYS.slice(0, 4), matches[0][5], matches[0][6]);
  assign(hours, ["fri"], matches[1][3], matches[1][4]);
  assign(hours, ["sat"], matches[2][1], matches[2][2]);
  return { hours, qualification: { scope: "kitchen", label: "Dinner hours", note: "These are dinner service hours. Bar and happy-hour times differ.", usage: "display_only" } };
}
function hootch(document: Document): QualifiedSchedule {
  if (document.title !== "Hootch & Banter | Frederick, MD") throw Error("Changed Hootch name identity.");
  const addresses = [...document.querySelectorAll("h3")].filter(node => /^49 S Market St, Frederick, MD 21701$/.test(visibleText(node)));
  if (addresses.length !== 1) throw Error("Missing or duplicate exact Hootch address identity.");
  addresses.forEach(visible);
  const phones = [...document.querySelectorAll("p,h3,a")].filter(node => /^\(301\) 732-4971$/.test(visibleText(node)));
  if (phones.length !== 1) throw Error("Missing or duplicate exact Hootch phone identity.");
  phones.forEach(visible);
  const heading = (label: string) => {
    const matches = [...document.querySelectorAll("h3")].filter(node => visibleText(node) === label);
    if (matches.length !== 1) throw Error("Missing or duplicate qualified dinner heading.");
    const wrapper = visible(matches[0]).parentElement;
    if (!wrapper?.matches(".wpb_wrapper")) throw Error("Unreviewed Hootch schedule layout.");
    return visible(wrapper);
  };
  const dinner = heading("DINNER HOURS"), brunch = heading("BRUNCH HOURS");
  const match = exact(dinner, new RegExp(`^DINNER HOURS MONDAY\\s*[-–—]\\s*THURSDAY ${RANGE} FRIDAY\\s*[-–—]\\s*SATURDAY ${RANGE} SUNDAY ${RANGE}$`, "i"));
  exact(brunch, /^BRUNCH HOURS SATURDAY & SUNDAY 11:00 AM\s*[-–—]\s*2:45 PM$/i);
  const text = visibleText(document.body);
  if (!text.includes("Our bar is open late Friday & Saturday night.") || !/Please note: our kitchen is closed on Saturday & Sunday from 2:45 p\.m\.\s*[-–—]\s*4:00 p\.m\. The restaurant is open for drinks only during this time\./.test(text)) throw Error("Changed Hootch service qualification.");
  const closure = "We are closed on the following holidays: Memorial Day, July 4th, Labor Day, Thanksgiving, Christmas Eve, Christmas Day and New Years Day.";
  const closures = [...document.querySelectorAll("p")].filter(node => /^We are closed on the following holidays:/.test(visibleText(node)));
  if (!closures.length || closures.some(node => visibleText(node) !== closure)) throw Error("Missing or conflicting reviewed Hootch closure qualifier.");
  const hours: Hours = {};
  assign(hours, DAYS.slice(0, 4), match[1], match[2]); assign(hours, ["fri", "sat"], match[3], match[4]); assign(hours, ["sun"], match[5], match[6]);
  return { hours, qualification: { scope: "kitchen", label: "Dinner hours", note: "These are dinner service hours. Weekend brunch runs from 11 a.m. to 2:45 p.m. The kitchen closes between brunch and dinner. Bar hours differ. Closed on Memorial Day, July 4, Labor Day, Thanksgiving, Christmas Eve, Christmas Day and New Year’s Day.", usage: "display_only" } };
}

/** Three reviewed exact sources only. A qualified schedule is useful display
 * information, never proof of current visitability or admission availability.
 */
export function parseQualifiedMerchantHours(source: MerchantHoursSource, page: OfficialPageReceipt, document: Document, text: string, coverageFrom: string, coverageThrough: string): QualifiedSchedule | undefined {
  if (!SLUGS.has(source.slug)) return undefined;
  if (page.url !== source.url) throw Error("Mismatched qualified source URL.");
  rejectStructuredHours(document); rejectNotices(text);
  if ([...text.matchAll(/\bHours\b/gi)].length !== (source.slug === "hootch-and-banter-frederick" ? 2 : 1)) throw Error("Additional or missing qualified hours block.");
  if (source.slug !== "the-tasting-room-frederick") holdAnnualClosureBoundary(source.slug, coverageFrom, coverageThrough);
  if (source.slug === "national-museum-civil-war-medicine-frederick") return museum(document);
  if (source.slug === "the-tasting-room-frederick") return tastingRoom(document);
  return hootch(document);
}
