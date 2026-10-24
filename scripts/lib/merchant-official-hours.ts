import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { DayOfWeek, Hours } from "../../src/data/places";
import { MERCHANT_HOURS_SOURCES, merchantHoursExpiry, merchantHoursForPlace, merchantWeeklyHoursWindow, validateMerchantHoursArtifact, type MerchantHoursArtifact, type MerchantHoursRecord, type MerchantHoursSource } from "../../src/lib/merchant-hours";
import { WEEKDAYS, isCalendarDate } from "../../src/lib/official-hours";
import { isHoursFresh } from "../../src/lib/hours-freshness";
import { easternDayKey } from "../../src/lib/tz";
import type { OfficialPageReceipt } from "./fcpl-official-hours";
import { merchantHoursCohort } from "./merchant-hours-cohorts";
import { parseOfficialHoursCohort } from "./official-hours-cohort";
import { parseQualifiedMerchantHours } from "./qualified-merchant-hours";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
const CLOCK = "(\\d{1,2}(?::\\d{2})?\\s*[ap]m)";
function time(raw: string): string {
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match || +match[1] < 1 || +match[1] > 12 || +(match[2] ?? 0) > 59) throw new Error("Unrecognized merchant clock.");
  return `${String(+match[1] % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${match[2] ?? "00"}`;
}
function set(hours: Hours, days: DayOfWeek[], open: string, close: string) {
  for (const day of days) { if (hours[day]) throw new Error("Duplicate merchant weekday."); hours[day] = [{ open: time(open), close: time(close) }]; }
}
function textPage(html: string): { text: string; document: Document } {
  const document = new JSDOM(html).window.document;
  document.querySelectorAll("script:not([type='application/ld+json']):not([type='text/data'].js-hours-config):not([type='application/json'].js-hours-config),style,noscript,template").forEach((node) => node.remove());
  // Block boundaries preserve visible source order without executing scripts/resources.
  document.querySelectorAll("p,div,li,br,h1,h2,h3,h4,section,footer").forEach((node) => node.appendChild(document.createTextNode(" ")));
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script").forEach((node) => node.remove());
  return { text: (clone.textContent ?? "").replace(/\s+/g, " ").trim(), document };
}
function oneVisibleSchedule(text: string, pattern: RegExp): RegExpMatchArray {
  const matches = [...text.matchAll(new RegExp(pattern.source, "gi"))];
  if (!matches.length || matches.some((row) => row.slice(1).map(time).join("|") !== matches[0].slice(1).map(time).join("|"))) throw new Error("Missing or conflicting visible merchant schedules.");
  return matches[0];
}
const REVIEWED_LOCATIONS: Partial<Record<MerchantHoursSource["slug"], { name: string; street: string; zip: string; phone: string; visibleCity?: string }>> = {
  "white-rabbit-gastropub": { name: "White Rabbit Gastropub", street: "18 Market Space", zip: "21701", phone: "2406511952", visibleCity: "Frederick Maryland" },
  pistarros: { name: "Pistarro’s", street: "221 N East St", zip: "21701", phone: "3013789536" },
  "jojos-restaurant-tap-house": { name: "JoJo's Restaurant & Tap House", street: "16-18 East Patrick Street", zip: "21701", phone: "3017325197" },
  "thai-table-frederick": { name: "Thai Table", street: "5221 Buckeystown Pike Suite A", zip: "21704", phone: "2408777034" },
  "thai-meric-eatery-bar-frederick": { name: "Thai Meric Eatery & Bar", street: "1170 W Patrick St Ste E", zip: "21703", phone: "2406510998" },
};
function reviewedVisibleSchedule(text: string, pattern: RegExp): RegExpMatchArray {
  const matches = [...text.matchAll(new RegExp(pattern.source, "gi"))];
  // A second, incomplete or differently formatted Hours block is unresolved
  // evidence too; it cannot be ignored merely because one old block matched.
  const headings = [...text.matchAll(/\b(?:Business\s+)?Hours\b/gi)];
  if (headings.length !== matches.length || headings.some((heading) => !matches.some((match) => match.index === heading.index))) throw new Error("Missing or conflicting visible merchant schedules.");
  return oneVisibleSchedule(text, pattern);
}
const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const phoneNumber = (value: string) => value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
function requireVisibleLocation(text: string, source: MerchantHoursSource) {
  const location = REVIEWED_LOCATIONS[source.slug];
  if (!location || ![location.name, location.street, location.visibleCity ?? `Frederick MD ${location.zip}`, location.phone].every((part) => compact(text).includes(compact(part)))) throw new Error("Missing exact reviewed merchant location identity.");
}
function setWindows(hours: Hours, days: DayOfWeek[], clocks: string[]) {
  const slots = [];
  for (let i = 0; i < clocks.length; i += 2) slots.push({ open: time(clocks[i]), close: time(clocks[i + 1]) });
  if (slots.length > 2 || slots.some((slot) => slot.open === slot.close) || (slots.length === 2 && !(slots[0].open < slots[0].close && slots[0].close <= slots[1].open && slots[1].open < slots[1].close))) throw new Error("Overlapping or invalid merchant service periods.");
  for (const day of days) {
    if (hours[day]) throw new Error("Duplicate merchant weekday.");
    hours[day] = slots.map((slot) => ({ ...slot }));
  }
}
function structuredOpeningHours(document: Document, source: MerchantHoursSource): (string | Hours)[] {
  const permitFlat = source.slug === "gravel-and-grind-frederick" || source.slug === "dublin-roasters-frederick";
  const schedules: (string | Hours)[] = [];
  const decode = (value: string) => { const node = document.createElement("textarea"); node.innerHTML = value; return node.value; };
  function reviewedSpecifications(entity: Record<string, unknown>): Hours {
    const location = REVIEWED_LOCATIONS[source.slug];
    const address = entity.address as Record<string, unknown> | undefined;
    let url: URL | undefined;
    try { if (typeof entity.url === "string") url = new URL(entity.url); } catch { /* Invalid identity fails below. */ }
    const types = Array.isArray(entity["@type"]) ? entity["@type"] : [entity["@type"]];
    if (!location || !types.includes("Restaurant") || typeof entity.name !== "string" || compact(decode(entity.name)) !== compact(location.name)
      || !address || typeof address.streetAddress !== "string" || compact(address.streetAddress) !== compact(location.street)
      || address.addressLocality !== "Frederick" || address.addressRegion !== "MD" || address.postalCode !== location.zip || address.addressCountry !== "US"
      || typeof entity.telephone !== "string" || phoneNumber(entity.telephone) !== location.phone
      || !url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hostname.replace(/^www\./, "") !== new URL(source.url).hostname.replace(/^www\./, "")) throw new Error("Mismatched structured merchant location identity.");
    if (!Array.isArray(entity.openingHoursSpecification) || !entity.openingHoursSpecification.length || entity.openingHoursSpecification.length > 14) throw new Error("Unreviewed structured merchant hours format.");
    const hours: Hours = {};
    const fullDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    for (const value of entity.openingHoursSpecification) {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unreviewed structured merchant hours format.");
      const row = value as Record<string, unknown>;
      if (row["@type"] !== "OpeningHoursSpecification" || Object.keys(row).some((key) => !["@type", "dayOfWeek", "opens", "closes"].includes(key))) throw new Error("Unreviewed structured merchant hours format.");
      const days = Array.isArray(row.dayOfWeek) ? row.dayOfWeek : [row.dayOfWeek];
      if (!days.length || days.length > 7 || new Set(days).size !== days.length) throw new Error("Invalid structured merchant weekdays.");
      const clock = (value: unknown) => {
        if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(value)) throw new Error("Invalid structured merchant clock.");
        return value.slice(0, 5);
      };
      const open = clock(row.opens), close = clock(row.closes);
      const closed = source.slug === "jojos-restaurant-tap-house" && open === "00:00" && close === "00:00";
      if (open === close && !closed) throw new Error("Ambiguous structured all-day merchant hours.");
      for (const value of days) {
        const i = typeof value === "string" ? fullDays.indexOf(value.replace(/^https:\/\/schema\.org\//, "")) : -1;
        if (i < 0) throw new Error("Unrecognized structured merchant weekday.");
        const day = WEEKDAYS[i];
        if (closed) {
          if (hours[day]) throw new Error("Duplicate structured merchant weekday.");
          hours[day] = [];
        } else {
          if (hours[day]?.length === 0) throw new Error("Conflicting structured closed weekday.");
          hours[day] ??= [];
          hours[day]!.push({ open, close });
        }
      }
    }
    for (const slots of Object.values(hours)) {
      if (!Array.isArray(slots)) continue;
      slots.sort((a, b) => a.open.localeCompare(b.open));
      if (slots.length > 2 || (slots.length === 2 && !(slots[0].open < slots[0].close && slots[0].close <= slots[1].open && slots[1].open < slots[1].close))) throw new Error("Duplicate or overlapping structured merchant periods.");
    }
    return hours;
  }
  function visit(value: unknown, flat: boolean) {
    if (Array.isArray(value)) { value.forEach((item) => visit(item, flat)); return; }
    if (!value || typeof value !== "object") return;
    if ("specialOpeningHoursSpecification" in value) throw new Error("Unreviewed structured merchant hours format.");
    if ("openingHoursSpecification" in value) {
      if (!REVIEWED_LOCATIONS[source.slug]) throw new Error("Unreviewed structured merchant hours format.");
      schedules.push(reviewedSpecifications(value as Record<string, unknown>));
    }
    if ("openingHours" in value) {
      if (!permitFlat || !flat || typeof value.openingHours !== "string") throw new Error("Unreviewed structured merchant hours format.");
      if (source.slug === "dublin-roasters-frederick") {
        const entity = value as Record<string, unknown>;
        const types = Array.isArray(entity["@type"]) ? entity["@type"] : [entity["@type"]];
        const address = typeof entity.address === "string" ? entity.address : "";
        if (!types.some((type) => type === "LocalBusiness" || type === "CafeOrCoffeeShop")
          || typeof entity.name !== "string" || !/^Dublin Roasters(?: Coffee)?$/i.test(entity.name.trim())
          || !/1780 N\.? Market (?:Street|St\.?)\s*,?\s*Frederick,?\s*MD\s*21701/i.test(address)
          || typeof entity.telephone !== "string" || phoneNumber(entity.telephone) !== "2402859146") throw new Error("Mismatched structured Dublin location identity.");
      }
      schedules.push(value.openingHours);
    }
    for (const child of Object.values(value)) if (typeof child === "object") visit(child, false);
  }
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    let value: unknown; try { value = JSON.parse(script.textContent ?? ""); } catch { throw new Error("Invalid structured merchant evidence."); }
    visit(value, true);
  }
  return schedules;
}

/** Explicit source adapters only. Unknown notices, missing days, duplicate dates or conflicting facts require review. */
export function parseMerchantOfficialHours(source: MerchantHoursSource, page: OfficialPageReceipt, now = new Date()): MerchantHoursRecord {
  if (!MERCHANT_HOURS_SOURCES.some((item) => item.slug === source.slug && item.url === source.url) || page.url !== source.url || !isHoursFresh(page.observedAt, now)) throw new Error("Unapproved merchant source or observation.");
  const { text, document } = textPage(page.html);
  const defaultWindow = source.kind === "weekly" ? merchantWeeklyHoursWindow(source.slug, page.observedAt) : undefined;
  const qualified = parseQualifiedMerchantHours(source, page, document, text, easternDayKey(new Date(page.observedAt)), defaultWindow?.coverage_through ?? easternDayKey(new Date(page.observedAt)));
  if (!qualified && /temporarily closed|closed (?:today|tomorrow|for)|closing early|special hours|holiday hours|until sold out|drinks only|kitchen hours/i.test(text)) throw new Error("Unresolved merchant notice or service qualifier.");
  const cohort = merchantHoursCohort(source);
  const structured = qualified || cohort?.cohort.shape === "jsonld_weekly_location_cards" ? [] : structuredOpeningHours(document, source);
  const hours: Hours = {};
  let from = easternDayKey(new Date(page.observedAt));
  let through: string | undefined;
  if (qualified) {
    Object.assign(hours, qualified.hours);
  } else if (cohort) {
    Object.assign(hours, parseOfficialHoursCohort(document, text, cohort.cohort, cohort.binding));
  } else if (source.kind === "dated_week") {
    if (!/Brewer[’']?s Alley/i.test(text)) throw new Error("Missing Brewer's Alley identity.");
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const pattern = new RegExp(`(${days.join("|")}) (\\d{1,2})/(\\d{1,2})/(\\d{2}|\\d{4}): ${CLOCK} to ${CLOCK}`, "gi");
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 7) throw new Error("Incomplete or duplicated dated merchant week.");
    const dates: string[] = [];
    for (const m of matches) {
      const year = m[4].length === 2 ? 2000 + +m[4] : +m[4];
      const date = `${year}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      const day = days.findIndex((value) => value.toLowerCase() === m[1].toLowerCase());
      if (!isCalendarDate(date) || (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7 !== day) throw new Error("Dated merchant weekday does not match its date.");
      set(hours, [WEEKDAYS[day]], m[5], m[6]); dates.push(date);
    }
    dates.sort(); from = dates[0]; through = dates[6];
    if (dates.some((date, i) => Date.parse(date) !== Date.parse(from) + i * 86_400_000)) throw new Error("Nonconsecutive merchant dates.");
  } else if (source.slug === "gravel-and-grind-frederick") {
    if (!/Gravel\s*&\s*Grind/i.test(text) || !/15 East 6th Street/i.test(text) || !/Frederick,? MD\s*21701/i.test(text)) throw new Error("Missing exact Gravel & Grind identity.");
    const range = `\\s*[-–—]\\s*${CLOCK}`;
    const match = oneVisibleSchedule(text, new RegExp(`Hours Monday\\s*[-–—]\\s*Tuesday ${CLOCK}${range} Wednesday\\s*[-–—]\\s*Saturday ${CLOCK}${range} Sunday ${CLOCK}${range} Contact`, "i"));
    set(hours, ["mon", "tue"], match[1], match[2]); set(hours, ["wed", "thu", "fri", "sat"], match[3], match[4]); set(hours, ["sun"], match[5], match[6]);
  } else if (source.slug === "delaplaine-arts-center-frederick") {
    // Public visit and footer copies must agree. Class/event clocks elsewhere
    // on this exact homepage cannot supply missing public gallery hours.
    const footer = document.querySelector("footer");
    const footerText = (footer?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!footer || !/\b(?:The )?Delaplaine Arts Center\b/i.test(footerText)
      || !/\b40 S Carroll St,? Frederick,? MD 21701\b/i.test(footerText)
      || !/(?<!\d)301[ .-]698[ .-]0656(?!\d)/.test(footerText)) throw new Error("Missing exact Delaplaine gallery identity.");
    if (/\b(?:closed|closing|closures?|holiday hours|special hours|last admission|last admittance|by appointment|hours\s+(?:vary|may|subject to))\b/i.test(text)
      || /\b(?:class(?:es)?|workshop|studio|office|rental)\s+(?:hours|open daily)\b/i.test(text)) throw new Error("Unresolved Delaplaine notice or service qualifier.");
    const blocks = [...document.querySelectorAll(".elementor-widget-text-editor .elementor-widget-container")]
      .filter((node) => /\bOPEN DAILY\b/i.test(node.textContent ?? ""));
    const hidden = (node: Element) => {
      for (let current: Element | null = node; current; current = current.parentElement) {
        if (current.hasAttribute("hidden") || current.hasAttribute("inert") || current.getAttribute("aria-hidden") === "true"
          || /display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)/i.test(current.getAttribute("style") ?? "")) return true;
      }
      return false;
    };
    const range = `${CLOCK}\\s*[-–—]\\s*${CLOCK}`;
    const pattern = new RegExp(`\\bOPEN DAILY Monday\\s*[-–—]\\s*Saturday,?\\s*${range} Sunday,?\\s*${range}\\.?`, "i");
    const matches = [...text.matchAll(new RegExp(pattern.source, "gi"))];
    const markers = [...text.matchAll(/\bOPEN DAILY\b/gi)];
    if (blocks.length < 2 || !blocks.some((node) => footer.contains(node)) || blocks.some(hidden)
      || !/\bPlan Your VISIT OPEN DAILY\b/i.test(text) || matches.length !== blocks.length || markers.length !== matches.length
      || blocks.some((node) => [...(node.textContent ?? "").replace(/\s+/g, " ").matchAll(new RegExp(pattern.source, "gi"))].length !== 1)) throw new Error("Missing or conflicting visible Delaplaine gallery schedules.");
    const outsideSchedule = text.replace(new RegExp(pattern.source, "gi"), " ");
    const day = "(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)";
    if (/\bhours\b/i.test(outsideSchedule)
      || new RegExp(`\\b${day}(?:\\s*[-–—]\\s*${day})?\\s*[:,]?\\s*(?:${CLOCK}|closed\\b)`, "i").test(outsideSchedule)) throw new Error("Unreviewed additional Delaplaine schedule.");
    const match = oneVisibleSchedule(text, pattern);
    if (time(match[1]) >= time(match[2]) || time(match[3]) >= time(match[4])) throw new Error("Unreviewed Delaplaine overnight gallery hours.");
    setWindows(hours, ["mon", "tue", "wed", "thu", "fri", "sat"], match.slice(1, 3));
    setWindows(hours, ["sun"], match.slice(3, 5));
  } else if (source.slug === "dublin-roasters-frederick") {
    if (!/Dublin Roasters/i.test(text)
      || !/1780 N\.? Market (?:Street|St\.?)\s*[●·,]?\s*Frederick,?\s*MD\s*21701/i.test(text)
      || !/\(?240\)?[ -]285[ -]9146/.test(text)) throw new Error("Missing exact Dublin Roasters location identity.");
    const match = oneVisibleSchedule(text, new RegExp(`Hours Mon\\s*[-–—]\\s*Fri:\\s*${CLOCK}\\s*[-–—]\\s*${CLOCK} Sat\\s*[-–—]\\s*Sun:\\s*${CLOCK}\\s*[-–—]\\s*${CLOCK}`, "i"));
    set(hours, ["mon", "tue", "wed", "thu", "fri"], match[1], match[2]);
    set(hours, ["sat", "sun"], match[3], match[4]);
  } else if (source.slug === "beans-in-the-belfry-brunswick") {
    if (!/Beans in the Belfry/i.test(text) || !/122 West Potomac Street,? Brunswick,? MD\s*21716/i.test(text) || !/301[ -]834[ -]7178/.test(text)) throw new Error("Missing exact Beans in the Belfry identity.");
    const match = oneVisibleSchedule(text, new RegExp(`Opening Hours Monday to Friday ${CLOCK} to ${CLOCK} Saturday and Sunday ${CLOCK} to ${CLOCK}`, "i"));
    set(hours, ["mon", "tue", "wed", "thu", "fri"], match[1], match[2]); set(hours, ["sat", "sun"], match[3], match[4]);
  } else if (source.slug === "alekos-middletown") {
    if (!/\bAleko(?:['’]s|s)\b/i.test(text)
      || !/\b6\s+N\s+Church\s+Street\s+Middletown,?\s+MD\s+21769\b/i.test(text)
      || !/\bTel:\s*\(?301\)?[ .-]*371[ .-]*3500(?!\d)/i.test(text)) throw new Error("Missing exact Aleko location identity.");
    if (/\b(?:seasonal|summer|winter|pickup|pick-up|delivery|takeout|take-out|online)(?:\s+only)?\s+hours\b|\b(?:pickup|pick-up|delivery|takeout|take-out|online)\s+only\b|\bhours (?:vary|may|subject to)|by appointment/i.test(text)) throw new Error("Unresolved Aleko notice or service qualifier.");
    const range = `${CLOCK}\\s*[-–—]\\s*${CLOCK}`;
    const pattern = new RegExp(`HOURS:\\s*Monday CLOSED Tuesday ${range} Wednesday ${range} Thursday ${range} Friday ${range} Saturday ${range} Sunday CLOSED`, "i");
    const matches = [...text.matchAll(new RegExp(pattern.source, "gi"))];
    const weekdays = [...text.matchAll(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi)];
    if (weekdays.some((day) => !matches.some((match) => day.index >= match.index && day.index < match.index + match[0].length))) throw new Error("Missing or conflicting visible Aleko schedule.");
    const match = reviewedVisibleSchedule(text, pattern);
    hours.mon = []; hours.sun = [];
    set(hours, ["tue"], match[1], match[2]);
    set(hours, ["wed"], match[3], match[4]);
    set(hours, ["thu"], match[5], match[6]);
    set(hours, ["fri"], match[7], match[8]);
    set(hours, ["sat"], match[9], match[10]);
  } else if (source.slug === "kulfi-ice-creams-frederick") {
    if (!/Kulfi Ice Cream\b/i.test(text) || !/5241 Buckeystown Pike Frederick MD 21704/i.test(text) || !/\(240\) 815-5466/.test(text)) throw new Error("Missing exact Kulfi location identity.");
    if (/\b(?:seasonal|summer|winter|pickup|pick-up|delivery|takeout|take-out|online)(?:\s+only)?\s+hours\b|\b(?:pickup|pick-up|delivery|takeout|take-out|online)\s+only\b|\bhours (?:vary|may|subject to)|by appointment/i.test(text)) throw new Error("Unresolved Kulfi notice or service qualifier.");
    // Both posted copies share the PM suffix in these exact afternoon ranges.
    // This reviewed typography belongs only to Kulfi, not other sources.
    const normalized = text.replace(/\b([123])(?=\s*[-–—]\s*(?:9|11)pm\b)/gi, "$1pm");
    const range = `${CLOCK}\\s*[-–—]\\s*${CLOCK}`;
    const pattern = new RegExp(`(?:Opening Hours\\s+)?Mon\\s*[-–—]\\s*Wed:\\s*${range}\\s*,?\\s*Thursday:\\s*${range} Fri\\s*[-–—]\\s*Sat:\\s*${range}\\s*,?\\s*Sunday:\\s*${range}`, "i");
    const matches = [...normalized.matchAll(new RegExp(pattern.source, "gi"))];
    const markers = [...normalized.matchAll(/\b(?:Hours|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b/gi)];
    if (matches.length < 2 || markers.some((marker) => !matches.some((match) => marker.index! >= match.index! && marker.index! < match.index! + match[0].length))) throw new Error("Missing or conflicting visible merchant schedules.");
    const match = oneVisibleSchedule(normalized, pattern);
    setWindows(hours, ["mon", "tue", "wed"], match.slice(1, 3)); setWindows(hours, ["thu"], match.slice(3, 5));
    setWindows(hours, ["fri", "sat"], match.slice(5, 7)); setWindows(hours, ["sun"], match.slice(7, 9));
    if (WEEKDAYS.some((day) => hours[day]?.some((slot) => slot.open >= slot.close))) throw new Error("Unreviewed Kulfi overnight hours.");
  } else if (source.slug === "sumittra-thai-cuisine") {
    const identity = compact(text.replace(/\bMaryland\b/gi, "MD"));
    if (!identity.includes(compact("Sumittra Thai Cuisine 12 E Patrick St Frederick MD 21701 3016682303 Monday Thursday"))) throw new Error("Missing exact Sumittra location identity.");
    // This exact posted lunch/dinner block abbreviates the second PM and noon.
    // Do not generalize that typography repair to other sources or holidays.
    const normalized = text.replace(/\b4:30(?=\s*[-–—]\s*(?:9:00|10:00)PM\b)/gi, "4:30PM")
      .replace(/\b(Saturday|Sunday\s*&\s*Holidays):\s*12:00(?=\s*[-–—])/gi, "$1: 12:00PM");
    const range = `${CLOCK}\\s*[-–—]\\s*${CLOCK}`;
    const pattern = new RegExp(`Monday\\s*[-–—]\\s*Thursday ${range},\\s*${range} Friday:\\s*${range},\\s*${range} Saturday:\\s*${range} Sunday\\s*&\\s*Holidays:\\s*${range} \\*{0,2}Hours of service may differ\\*{0,2}`, "i");
    const matches = [...normalized.matchAll(new RegExp(pattern.source, "gi"))];
    const starts = [...normalized.matchAll(/\bMonday\s*[-–—]\s*Thursday\b/gi)];
    if (starts.length !== matches.length || starts.some((start) => !matches.some((match) => match.index === start.index))) throw new Error("Missing or conflicting visible merchant schedules.");
    const match = oneVisibleSchedule(normalized, pattern);
    setWindows(hours, ["mon", "tue", "wed", "thu"], match.slice(1, 5));
    setWindows(hours, ["fri"], match.slice(5, 9)); setWindows(hours, ["sat"], match.slice(9, 11)); setWindows(hours, ["sun"], match.slice(11, 13));
  } else if (source.slug === "the-curious-iguana-frederick") {
    // The source's phone anchor is a placeholder; identity uses visible facts.
    if (!["Curious Iguana", "12 North Market Street", "Frederick MD 21701", "3016952500"].every((part) => compact(text).includes(compact(part)))) throw new Error("Missing exact Curious Iguana location identity.");
    const range = `${CLOCK}\\s*[-–—]\\s*${CLOCK}`;
    const match = reviewedVisibleSchedule(text, new RegExp(`HOURS Sun\\s*[-–—]\\s*Wed:\\s*${range} Thur\\s*[-–—]\\s*Sat:\\s*${range} First Sat:\\s*${range}`, "i"));
    if (time(match[5]) !== "10:00" || time(match[6]) !== "21:00") throw new Error("Unreviewed first-Saturday schedule.");
    setWindows(hours, ["sun", "mon", "tue", "wed"], match.slice(1, 3));
    setWindows(hours, ["thu", "fri", "sat"], match.slice(3, 5));
  } else if (source.slug === "il-porto-restaurant") {
    // Location-local identity must precede this schedule; the shared navigation
    // also contains Gaithersburg's phone and cannot establish Frederick facts.
    if (!/Il Porto Frederick Address 200 S\.? Market Street Frederick,? MD 21701(?: Frederick,? MD 21701)? Phone:\s*301[. -]620[. -]7480(?: Facebook)? BUSINESS HOURS:/i.test(text)) throw new Error("Missing exact Il Porto Frederick location identity.");
    const normalized = text.replace(/\b11:30am\s+am(?=\s+to\s+(?:10:00|9:00)\s*pm\b)/gi, "11:30am");
    const range = `${CLOCK}\\s+to\\s+${CLOCK}`;
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const match = reviewedVisibleSchedule(normalized, new RegExp(`BUSINESS HOURS:\\s*${days.map((day) => `${day}: ${range}`).join(" ")}`, "i"));
    for (let i = 0; i < days.length; i++) setWindows(hours, [WEEKDAYS[i]], match.slice(1 + i * 2, 3 + i * 2));
  } else {
    requireVisibleLocation(text, source);
    const range = `${CLOCK}\\s*(?:[-–—]|to)\\s*${CLOCK}`;
    if (source.slug === "pistarros") {
      const match = reviewedVisibleSchedule(text, new RegExp(`Hours:\\s*Monday\\s*[-–—]\\s*Thursday:\\s*${range} Friday\\s*[-–—]\\s*Saturday:\\s*${range} Sunday:\\s*${range}`, "i"));
      setWindows(hours, ["mon", "tue", "wed", "thu"], match.slice(1, 3));
      setWindows(hours, ["fri", "sat"], match.slice(3, 5)); setWindows(hours, ["sun"], match.slice(5, 7));
    } else if (source.slug === "jojos-restaurant-tap-house") {
      // These are the whole venue's visible Hours, not a promise of a full
      // dining-room menu until the Tap House closes.
      const match = reviewedVisibleSchedule(text, new RegExp(`Hours Mon,\\s*Tue Closed Wed,\\s*Thu ${range} Fri ${range} Sat ${range} Sun ${range}`, "i"));
      setWindows(hours, ["mon", "tue"], []); setWindows(hours, ["wed", "thu"], match.slice(1, 3));
      setWindows(hours, ["fri"], match.slice(3, 5)); setWindows(hours, ["sat"], match.slice(5, 7)); setWindows(hours, ["sun"], match.slice(7, 9));
    } else if (source.slug === "thai-table-frederick") {
      const match = reviewedVisibleSchedule(text, new RegExp(`Hours MON\\s*:\\s*CLOSED TUE\\s*[-–—]\\s*THU\\s*:\\s*${range},\\s*${range} FRI\\s*:\\s*${range},\\s*${range} SAT\\s*:\\s*${range} SUN\\s*:\\s*${range}`, "i"));
      setWindows(hours, ["mon"], []); setWindows(hours, ["tue", "wed", "thu"], match.slice(1, 5));
      setWindows(hours, ["fri"], match.slice(5, 9)); setWindows(hours, ["sat"], match.slice(9, 11)); setWindows(hours, ["sun"], match.slice(11, 13));
    } else if (source.slug === "thai-meric-eatery-bar-frederick") {
      const weekday = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => `${day}: ${range},\\s*${range}`).join(" ");
      const match = reviewedVisibleSchedule(text, new RegExp(`Business Hours Sunday: ${range} ${weekday} Saturday: ${range}`, "i"));
      setWindows(hours, ["sun"], match.slice(1, 3));
      for (let i = 0; i < 5; i++) setWindows(hours, [WEEKDAYS[i]], match.slice(3 + i * 4, 7 + i * 4));
      setWindows(hours, ["sat"], match.slice(23, 25));
    } else if (source.slug === "white-rabbit-gastropub") {
      const match = reviewedVisibleSchedule(text, new RegExp(`Hours~? Open 7 days a week, ${range} Brunch: Sat\\s*[-–—]\\s*Sun, ${range}`, "i"));
      // Brunch is a subset of the explicitly stated whole-venue week. Its
      // narrower service times cannot replace or extend public opening hours.
      const [open, close, brunchOpen, brunchClose] = match.slice(1).map(time);
      if (!(open < close && open <= brunchOpen && brunchOpen < brunchClose && brunchClose <= close)) throw new Error("Conflicting brunch and whole-venue merchant hours.");
      setWindows(hours, [...WEEKDAYS], match.slice(1, 3));
    } else throw new Error("Unreviewed merchant hours adapter.");
  }
  // Partial structured data may corroborate a visible day, never fill or
  // override it. This agreement check is shared by every admitted source.
  for (const schedule of structured) {
    if (typeof schedule !== "string") {
      for (const day of WEEKDAYS) if (schedule[day] && JSON.stringify(schedule[day]) !== JSON.stringify(hours[day])) throw new Error("Conflicting visible and structured merchant hours.");
      continue;
    }
    for (const part of schedule.split(",").map((item) => item.trim()).filter(Boolean)) {
      const found = part.match(/^(Mo|Tu|We|Th|Fr|Sa|Su) (\d{2}:\d{2})-(\d{2}:\d{2})$/);
      if (!found) throw new Error("Unrecognized structured merchant weekday.");
      const day = WEEKDAYS[["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].indexOf(found[1])];
      if (hours[day]?.[0]?.open !== found[2] || hours[day]?.[0]?.close !== found[3]) throw new Error("Conflicting visible and structured merchant hours.");
    }
  }
  const observedAt = new Date(page.observedAt).toISOString();
  const window = source.kind === "weekly" ? merchantWeeklyHoursWindow(source.slug, observedAt) : undefined;
  const expires = window?.expires_at ?? merchantHoursExpiry(observedAt, through);
  const record: MerchantHoursRecord = { slug: source.slug, source_url: source.url, source_name: source.name, source_sha256: createHash("sha256").update(page.html).digest("hex"), observed_at: observedAt, expires_at: expires, coverage_from: from, coverage_through: through ?? window!.coverage_through, kind: source.kind, hours, ...(qualified ? { qualification: qualified.qualification, ...(qualified.exceptions ? { exceptions: qualified.exceptions } : {}) } : {}) };
  validateMerchantHoursArtifact({ schema_version: 1, places: [record], review: [] });
  return record;
}
/** Reviewed fixed GETs, sequentially; no provider, credentials, redirects or retries. */
export async function fetchMerchantHoursPage(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 20_000): Promise<OfficialPageReceipt> {
  const source = MERCHANT_HOURS_SOURCES.find((item) => item.url === url);
  if (!source) throw new Error("Unapproved merchant URL.");
  if (MERCHANT_HOURS_SOURCES.some((source) => source.url === url && "collection" in source && source.collection === "manual")) throw new Error("Manual merchant sources require separately reviewed evidence; native fetching is disabled.");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20_000) throw new Error("Invalid source deadline.");
  const maxBytes = "max_response_bytes" in source ? source.max_response_bytes : 512_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 1_048_576) throw new Error("Invalid reviewed merchant response cap.");
  const capError = () => new Error(`Merchant page exceeds ${maxBytes === 512_000 ? "512 KB" : `${maxBytes} bytes`}.`);
  const controller = new AbortController(); const deadline = Date.now() + timeoutMs;
  async function bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Merchant source deadline exceeded.")); }, Math.max(0, deadline - Date.now())); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await bounded(fetchImpl(url, { redirect: "error", credentials: "omit", signal: controller.signal, headers: { Accept: "text/html" } }));
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || !response.body) throw new Error(`Merchant source failed (${response.status}).`);
    reader = response.body.getReader();
    // Content-Length may describe compressed bytes or be absent/understated.
    // It can refuse an oversized response early, never replace stream counting.
    const declaredBytes = response.headers.get("content-length");
    if (declaredBytes !== null && /^\d+$/.test(declaredBytes) && Number(declaredBytes) > maxBytes) throw capError();
    const chunks: Uint8Array[] = []; let bytes = 0; let reads = 0;
    for (;;) {
      if (Date.now() >= deadline) throw new Error("Merchant source deadline exceeded.");
      if (++reads > 2048) throw new Error("Merchant source body read limit exceeded.");
      const result = await bounded(reader.read()); if (result.done) break; bytes += result.value.byteLength; if (bytes > maxBytes) throw capError(); chunks.push(result.value); }
    return { url, html: Buffer.concat(chunks).toString("utf8"), observedAt: new Date().toISOString() };
  } finally { controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}
function approvedFacts(row: MerchantHoursRecord): string {
  return JSON.stringify({ slug: row.slug, source_url: row.source_url, source_name: row.source_name, kind: row.kind, hours: Object.fromEntries(WEEKDAYS.map((day) => [day, row.hours[day]])), qualification: row.qualification ?? null, exceptions: row.exceptions ?? [], ...(row.kind === "dated_week" ? { coverage_from: row.coverage_from, coverage_through: row.coverage_through } : {}) });
}
/** Gate accepted/public changes, not candidates held out of those public rows. */
export function merchantHoursNeedsReview(previous: unknown, next: MerchantHoursArtifact): boolean {
  try { validateMerchantHoursArtifact(previous); validateMerchantHoursArtifact(next); } catch { return true; }
  if (previous.places.length !== next.places.length) return true;
  if (next.places.some((row) => { const before = previous.places.find((item) => item.slug === row.slug); return !before || approvedFacts(before) !== approvedFacts(row); })) return true;
  // A new hold can suppress current accepted hours just as removing a hold
  // restores them. An already expired row has no public claim to suppress.
  if (next.review.some((held) => {
    const source = MERCHANT_HOURS_SOURCES.find((item) => item.slug === held.slug);
    return source && !previous.review.some((item) => item.slug === held.slug)
      && merchantHoursForPlace({ slug: source.slug, category: source.category, website: source.url }, previous, new Date(held.checked_at)).hours !== undefined;
  })) return true;
  // Removing a hold restores a public claim and always needs explicit review.
  return previous.review.some((held) => !next.review.some((item) => item.slug === held.slug));
}
export async function collectMerchantOfficialHours(previous: unknown, fetchPage: typeof fetchMerchantHoursPage = fetchMerchantHoursPage, now = new Date()): Promise<{ artifact: MerchantHoursArtifact; reviewRequired: boolean }> {
  // Losing or corrupting the approved baseline is not permission to re-enroll sources.
  validateMerchantHoursArtifact(previous);
  const artifact: MerchantHoursArtifact = { schema_version: 1, places: [], review: [] };
  // Share only this run's immutable actual receipt. Each slug still parses,
  // compares and retains its own approval/hold. Release bodies after last use.
  const receipts = new Map<string, Promise<OfficialPageReceipt>>();
  const usesLeft = new Map<string, number>();
  for (const source of MERCHANT_HOURS_SOURCES) {
    if (!("collection" in source && source.collection === "manual")) usesLeft.set(source.url, (usesLeft.get(source.url) ?? 0) + 1);
  }
  for (const source of MERCHANT_HOURS_SOURCES) {
    const approved = previous.places.find((row) => row.slug === source.slug);
    const held = previous.review.find((row) => row.slug === source.slug);
    // Intentional manual ownership is not a failed native read. Preserve the
    // exact approved/candidate observations and existing holds until reviewed.
    if ("collection" in source && source.collection === "manual") {
      if (approved) artifact.places.push(approved);
      if (held) artifact.review.push(held);
      continue;
    }
    const hold = (reason: MerchantHoursArtifact["review"][number]["reason"], candidate = held?.candidate) => {
      if (approved) artifact.places.push(approved);
      artifact.review.push({ slug: source.slug, checked_at: now.toISOString(), reason, ...(candidate ? { candidate } : {}) });
    };
    let page: OfficialPageReceipt;
    try {
      let receipt = receipts.get(source.url);
      if (!receipt) {
        receipt = Promise.resolve().then(() => fetchPage(source.url)).then((value) => Object.freeze({ ...value }));
        receipts.set(source.url, receipt);
      }
      page = await receipt;
    } catch { hold("source_unavailable"); continue; }
    finally {
      const remaining = usesLeft.get(source.url)! - 1;
      usesLeft.set(source.url, remaining);
      if (remaining === 0) receipts.delete(source.url);
    }
    let candidate: MerchantHoursRecord;
    try { candidate = parseMerchantOfficialHours(source, page, now); } catch { hold("unparseable_or_conflicted"); continue; }
    if (approved && !held && approvedFacts(approved) === approvedFacts(candidate)) {
      artifact.places.push(candidate);
    } else {
      // A dated new week, changed fact, new enrollment or unresolved prior hold
      // remains a proposal. Repeated successful fetches cannot auto-accept it.
      hold(approved && approvedFacts(approved) === approvedFacts(candidate) ? "pending_acceptance" : "changed_facts", candidate);
    }
  }
  validateMerchantHoursArtifact(artifact);
  return { artifact, reviewRequired: merchantHoursNeedsReview(previous, artifact) };
}
