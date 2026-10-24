import type { DayOfWeek, Hours } from "../../src/data/places";
import { WEEKDAYS } from "../../src/lib/official-hours";

type Identity = {
  name: string;
  street: string;
  locality: string;
  region: string;
  postalCode: string;
  phone: string;
};
export type OfficialHoursCohortBinding = {
  slug: string;
  source_name: string;
  identity: Identity;
};
type IdentitySelectors = {
  name: string;
  address: string;
  street: string;
  locality: string;
  region: string;
  postalCode: string;
  phone: string;
};
type CohortBase = {
  ledger_id: string;
  source_url: string;
  bindings: readonly OfficialHoursCohortBinding[];
  selectors: IdentitySelectors & { card: string; schedule: string };
};
/** Shapes are reviewed code, not selectors accepted from a fetched page or CLI. */
export type OfficialHoursCohort = CohortBase & ({
  shape: "shared_daily_contact_card";
  organization_name: string;
  schedule_container: string;
} | {
  shape: "jsonld_weekly_location_cards";
  schema_type: string;
  /** Each visible row must explicitly name one weekday and its complete periods. */
  schedule_row: string;
  entity_urls: Readonly<Record<string, string>>;
  closed_representation?: "midnight_equal";
} | {
  /** Reviewed primary-store Yext family, independent from the Safeway tabs. */
  shape: "microdata_primary_store_week";
  schema_type: string;
  entity_ids: Readonly<Record<string, string>>;
  hero_schedule: string;
  panel_schedule: string;
  schedule_row: string;
  day: string;
  periods: string;
} | {
  /** Reviewed store disclosure with independently corroborated public week. */
  shape: "microdata_store_week";
  schema_type: string;
  entity_ids: Readonly<Record<string, string>>;
  hours_section: string;
  toggle: string;
  panel: string;
  toggle_labels: readonly string[];
  store_label: string;
  independent_offer_names: readonly string[];
  hero_schedule: string;
  panel_schedule: string;
  schedule_row: string;
  day: string;
  periods: string;
});

const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const phone = (value: string) => value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const text = (node: Element): string => [...node.childNodes].map((child) => child.nodeType === 3 ? child.textContent ?? "" : child.nodeType === 1 ? text(child as Element) : "").join(" ").replace(/\s+/g, " ").trim();
const CLOCK = "(\\d{1,2}(?::\\d{2})?\\s*[ap]m)";
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function clock(value: string): string {
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match || +match[1] < 1 || +match[1] > 12 || +(match[2] ?? 0) > 59) throw new Error("Invalid cohort clock.");
  return `${String(+match[1] % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${match[2] ?? "00"}`;
}
function visible(node: Element): boolean {
  for (let current: Element | null = node; current; current = current.parentElement) {
    if (current.hasAttribute("hidden") || current.hasAttribute("inert") || current.getAttribute("aria-hidden") === "true"
      || /display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)/i.test(current.getAttribute("style") ?? "")) return false;
  }
  return true;
}
function one(parent: Element, selector: string): Element {
  const nodes = [...parent.querySelectorAll(selector)];
  if (nodes.length !== 1 || !visible(nodes[0]) || [...nodes[0].querySelectorAll("*")].some((node) => !visible(node))) throw new Error("Missing or ambiguous visible cohort field.");
  return nodes[0];
}
function addressMatches(node: Element, identity: Identity, selectors: IdentitySelectors): boolean {
  return compact(text(one(node, selectors.street))) === compact(identity.street)
    && text(one(node, selectors.locality)) === identity.locality
    && text(one(node, selectors.region)) === identity.region
    && text(one(node, selectors.postalCode)) === identity.postalCode;
}
function notices(value: string): boolean {
  return /temporarily closed|closed (?:today|tomorrow|for)|closing early|special hours|holiday hours|until sold out|drinks only|kitchen hours/i.test(value)
    || /\b(?:seasonal|summer|winter|pickup|pick-up|delivery|takeout|take-out|online)(?:\s+only)?\s+hours\b|\bhours (?:vary|may|subject to)|by appointment|last admission|last admittance/i.test(value);
}
function validateCohort(cohort: OfficialHoursCohort, binding: OfficialHoursCohortBinding) {
  const url = new URL(cohort.source_url);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !cohort.ledger_id
    || !cohort.bindings.length || cohort.bindings.length > 100
    || new Set(cohort.bindings.map((row) => row.slug)).size !== cohort.bindings.length
    || !cohort.bindings.includes(binding)
    || cohort.bindings.some((row) => !row.slug || !row.source_name || Object.values(row.identity).some((value) => !value))) throw new Error("Invalid reviewed cohort bindings.");
  if (cohort.shape === "microdata_store_week" || cohort.shape === "microdata_primary_store_week") {
    const ids = Object.keys(cohort.entity_ids);
    if (cohort.bindings.length !== 1 || ids.length !== 1 || ids[0] !== binding.slug
      || !cohort.entity_ids[binding.slug]?.startsWith(`${url.origin}/#`)
      || (cohort.shape === "microdata_store_week" && (!cohort.toggle_labels.length || new Set(cohort.toggle_labels).size !== cohort.toggle_labels.length
      || !cohort.toggle_labels.includes(cohort.store_label)))) throw new Error("Invalid reviewed store disclosure binding.");
  }
  if (cohort.shape === "jsonld_weekly_location_cards") {
    const urls = Object.values(cohort.entity_urls);
    if (urls.length !== cohort.bindings.length || new Set(urls).size !== urls.length || cohort.bindings.some((row) => {
      try {
        const entityUrl = new URL(cohort.entity_urls[row.slug]);
        return entityUrl.protocol !== "https:" || entityUrl.username || entityUrl.password || entityUrl.hash || entityUrl.hostname !== url.hostname;
      } catch { return true; }
    })) throw new Error("Invalid exact cohort entity URLs.");
  }
}
function sharedDaily(document: Document, pageText: string, cohort: Extract<OfficialHoursCohort, { shape: "shared_daily_contact_card" }>): Hours {
  const cards = [...document.querySelectorAll(cohort.selectors.card)];
  if (cards.length !== 1 || !visible(cards[0])) throw new Error("Missing or duplicated cohort contact identity.");
  const card = cards[0];
  if (text(one(card, cohort.selectors.name)) !== cohort.organization_name) throw new Error("Missing exact cohort organization identity.");
  const addresses = [...card.querySelectorAll(cohort.selectors.address)];
  if (addresses.length !== cohort.bindings.length || addresses.some((node) => !visible(node))) throw new Error("Incomplete cohort address identities.");
  for (const binding of cohort.bindings) {
    if (addresses.filter((node) => addressMatches(node, binding.identity, cohort.selectors)).length !== 1
      || [...card.querySelectorAll(cohort.selectors.phone)].filter((node) => visible(node) && phone(text(node)) === binding.identity.phone).length !== 1) throw new Error("Missing exact cohort location identity.");
  }
  const schedule = one(card, cohort.selectors.schedule);
  const match = text(schedule).match(new RegExp(`^${CLOCK}\\s*[-–—]\\s*${CLOCK} Daily$`, "i"));
  if (!match || card.querySelectorAll(cohort.schedule_container).length !== 1) throw new Error("Unqualified complete daily cohort schedule required.");
  const outside = document.body.cloneNode(true) as HTMLElement;
  outside.querySelectorAll(`${cohort.selectors.card},script`).forEach((node) => node.remove());
  const outsideText = text(outside);
  const extra = [...document.querySelectorAll(".hours,.store-hours,.business-hours,[itemprop='openingHours'],[itemprop='openingHoursSpecification']")].some((node) => !card.contains(node));
  if (extra || /\b(?:store|grocery|business|opening|holiday|special|seasonal|café|cafe)\s+hours\b/i.test(outsideText)
    || new RegExp(`\\bhours\\s*:?\\s*${CLOCK}`, "i").test(outsideText)
    || /\b(?:reduced|limited|extended|shortened|revised|changed|updated)\s+(?:(?:store|business)\s+)?hours\b/i.test(outsideText)
    || notices(pageText)) throw new Error("Unresolved cohort notice or extra schedule.");
  const open = clock(match[1]), close = clock(match[2]);
  if (open >= close) throw new Error("Unreviewed overnight cohort schedule.");
  return Object.fromEntries(WEEKDAYS.map((day) => [day, [{ open, close }]]));
}
function visibleWeek(card: Element, cohort: Extract<OfficialHoursCohort, { shape: "jsonld_weekly_location_cards" }>): Hours {
  const schedule = one(card, cohort.selectors.schedule);
  const outside = card.cloneNode(true) as HTMLElement;
  outside.querySelectorAll(`${cohort.selectors.schedule},script`).forEach((node) => node.remove());
  if (/\bhours\b|\bclos(?:ed|es|ing|ure)\b|\bopens?\s+(?:at|daily|on)\b/i.test(text(outside))
    || new RegExp(`(?:${FULL_DAYS.join("|")})\\s*:`, "i").test(text(outside))) throw new Error("Unreviewed additional cohort schedule.");
  const rows = [...schedule.querySelectorAll(cohort.schedule_row)];
  if (rows.length !== 7 || rows.some((node) => !visible(node))) throw new Error("Incomplete visible cohort week.");
  const hours: Hours = {};
  const range = new RegExp(`^${CLOCK}\\s*[-–—]\\s*${CLOCK}$`, "i");
  for (const row of rows) {
    const match = text(row).match(new RegExp(`^(${FULL_DAYS.join("|")}):\\s*(.+)$`, "i"));
    if (!match) throw new Error("Unreviewed visible cohort weekday format.");
    const day = WEEKDAYS[FULL_DAYS.findIndex((value) => value.toLowerCase() === match[1].toLowerCase())];
    if (hours[day]) throw new Error("Duplicate visible cohort weekday.");
    if (/^Closed$/i.test(match[2])) { hours[day] = []; continue; }
    const periods = match[2].split(/\s*,\s*/);
    if (!periods.length || periods.length > 2) throw new Error("Invalid visible cohort service periods.");
    const slots = periods.map((period) => {
      const clocks = period.match(range);
      if (!clocks) throw new Error("Unqualified visible cohort service period.");
      return { open: clock(clocks[1]), close: clock(clocks[2]) };
    });
    if (slots.some((slot) => slot.open >= slot.close) || (slots.length === 2 && slots[0].close > slots[1].open)) throw new Error("Overlapping or overnight cohort periods require review.");
    hours[day] = slots;
  }
  return hours;
}
function specifications(entity: Record<string, unknown>, cohort: Extract<OfficialHoursCohort, { shape: "jsonld_weekly_location_cards" }>): Hours {
  if (["specialOpeningHoursSpecification", "openingHours", "validFrom", "validThrough", "temporalCoverage"].some((key) => key in entity)
    || !Array.isArray(entity.openingHoursSpecification) || !entity.openingHoursSpecification.length || entity.openingHoursSpecification.length > 14) throw new Error("Unreviewed structured cohort schedule.");
  const hours: Hours = {};
  for (const value of entity.openingHoursSpecification) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid cohort specification.");
    const row = value as Record<string, unknown>;
    if (row["@type"] !== "OpeningHoursSpecification" || Object.keys(row).some((key) => !["@type", "dayOfWeek", "opens", "closes"].includes(key))) throw new Error("Unreviewed cohort specification qualifier.");
    const days = Array.isArray(row.dayOfWeek) ? row.dayOfWeek : [row.dayOfWeek];
    const validClock = (value: unknown) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!days.length || days.length > 7 || new Set(days).size !== days.length || !validClock(row.opens) || !validClock(row.closes)) throw new Error("Invalid structured cohort days or clocks.");
    const open = row.opens as string, close = row.closes as string;
    const closed = cohort.closed_representation === "midnight_equal" && open === "00:00" && close === "00:00";
    if (!closed && open >= close) throw new Error("Ambiguous all-day or overnight cohort specification.");
    for (const value of days) {
      const index = typeof value === "string" ? FULL_DAYS.indexOf(value.replace(/^https:\/\/schema\.org\//, "")) : -1;
      if (index < 0) throw new Error("Invalid structured cohort weekday.");
      const day: DayOfWeek = WEEKDAYS[index];
      if (closed) { if (hours[day]) throw new Error("Conflicting cohort closed day."); hours[day] = []; }
      else { if (hours[day]?.length === 0) throw new Error("Conflicting cohort open day."); (hours[day] ??= []).push({ open, close }); }
    }
  }
  for (const day of WEEKDAYS) {
    const slots = hours[day];
    if (!slots || slots.length > 2) throw new Error("Incomplete or duplicate structured cohort week.");
    slots.sort((a, b) => a.open.localeCompare(b.open));
    if (slots.length === 2 && slots[0].close > slots[1].open) throw new Error("Overlapping structured cohort periods.");
  }
  return hours;
}
function jsonldWeek(document: Document, pageText: string, cohort: Extract<OfficialHoursCohort, { shape: "jsonld_weekly_location_cards" }>, binding: OfficialHoursCohortBinding): Hours {
  if (notices(pageText)) throw new Error("Unresolved cohort notice or service qualifier.");
  const cards = [...document.querySelectorAll(cohort.selectors.card)];
  const matched = cards.filter((card) => {
    if (!visible(card)) return false;
    const addresses = [...card.querySelectorAll(cohort.selectors.address)];
    try { return addresses.length === 1 && addressMatches(addresses[0], binding.identity, cohort.selectors); }
    catch { return false; }
  });
  if (matched.length !== 1) throw new Error("Missing or duplicated exact cohort location card.");
  const card = matched[0];
  if (compact(text(one(card, cohort.selectors.name))) !== compact(binding.identity.name)
    || phone(text(one(card, cohort.selectors.phone))) !== binding.identity.phone) throw new Error("Mismatched visible cohort location identity.");
  const entities: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const entity = value as Record<string, unknown>;
    if ("openingHoursSpecification" in entity || "openingHours" in entity || "specialOpeningHoursSpecification" in entity) entities.push(entity);
    Object.values(entity).filter((child) => child && typeof child === "object").forEach(visit);
  };
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    let value: unknown;
    try { value = JSON.parse(script.textContent ?? ""); } catch { throw new Error("Invalid structured cohort evidence."); }
    visit(value);
  }
  const entityUrl = cohort.entity_urls[binding.slug];
  const candidates = entities.filter((entity) => {
    const address = entity.address as Record<string, unknown> | undefined;
    // A same URL, name or street with a different branch identity is evidence
    // to review, not an unrelated entity silently selected around a conflict.
    return entity.url === entityUrl || (address && typeof address.streetAddress === "string" && compact(address.streetAddress) === compact(binding.identity.street));
  });
  if (!entityUrl || candidates.length !== 1) throw new Error("Missing or ambiguous structured cohort identity.");
  const entity = candidates[0], identity = binding.identity;
  const address = entity.address as Record<string, unknown> | undefined;
  const types = Array.isArray(entity["@type"]) ? entity["@type"] : [entity["@type"]];
  if (!types.includes(cohort.schema_type) || entity.url !== entityUrl || typeof entity.name !== "string" || compact(entity.name) !== compact(identity.name)
    || typeof entity.telephone !== "string" || phone(entity.telephone) !== identity.phone
    || !address || typeof address.streetAddress !== "string" || compact(address.streetAddress) !== compact(identity.street)
    || address.addressLocality !== identity.locality || address.addressRegion !== identity.region || address.postalCode !== identity.postalCode || address.addressCountry !== "US") throw new Error("Mismatched structured cohort location identity.");
  const visibleHours = visibleWeek(card, cohort), structuredHours = specifications(entity, cohort);
  for (const day of WEEKDAYS) if (JSON.stringify(visibleHours[day]) !== JSON.stringify(structuredHours[day])) throw new Error("Conflicting visible and structured cohort hours.");
  return visibleHours;
}

function machineWeek(raw: string | null): Hours {
  let rows: unknown;
  try { rows = JSON.parse(raw ?? ""); } catch { throw new Error("Invalid store machine week."); }
  if (!Array.isArray(rows) || rows.length !== 7) throw new Error("Incomplete store machine week.");
  const hours: Hours = {};
  const numericClock = (value: unknown) => {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 2359 || (value as number) % 100 > 59) throw new Error("Invalid store machine clock.");
    return `${String(Math.floor((value as number) / 100)).padStart(2, "0")}:${String((value as number) % 100).padStart(2, "0")}`;
  };
  for (const value of rows) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid store machine weekday.");
    const row = value as Record<string, unknown>;
    const index = FULL_DAYS.findIndex((day) => day.toUpperCase() === row.day);
    if (index < 0 || hours[WEEKDAYS[index]] || Object.keys(row).some((key) => !["day", "intervals", "isClosed"].includes(key))
      || row.isClosed !== false || !Array.isArray(row.intervals) || row.intervals.length !== 1) throw new Error("Unreviewed store machine weekday.");
    const interval = row.intervals[0] as Record<string, unknown>;
    if (!interval || Object.keys(interval).some((key) => !["start", "end"].includes(key))) throw new Error("Unreviewed store interval qualifier.");
    const open = numericClock(interval.start), close = numericClock(interval.end);
    if (open >= close) throw new Error("Overnight or all-day store schedule needs review.");
    hours[WEEKDAYS[index]] = [{ open, close }];
  }
  return hours;
}
function microdataStoreWeek(document: Document, pageText: string, cohort: Extract<OfficialHoursCohort, { shape: "microdata_store_week" }>, binding: OfficialHoursCohortBinding): Hours {
  const canonical = [...document.querySelectorAll("link[rel='canonical']")];
  const cards = [...document.querySelectorAll(cohort.selectors.card)];
  if (canonical.length !== 1 || canonical[0].getAttribute("href") !== cohort.source_url || cards.length !== 1 || !visible(cards[0])) throw new Error("Missing exact store page identity.");
  const card = cards[0], identity = binding.identity;
  // Separately typed service offers describe delivery/floral services, not the
  // grocery's public store schedule. Never remove contact or hours containers.
  if (/temporarily closed|closed (?:today|tomorrow|for)|closing early|special hours|holiday hours|last admission|last admittance/i.test(pageText)) throw new Error("Unresolved store closure notice.");
  const noticeCopy = document.body.cloneNode(true) as HTMLElement;
  noticeCopy.querySelectorAll("[itemprop='makesOffer'][itemtype='http://schema.org/Offer']").forEach((offer) => {
    const names = [...offer.querySelectorAll("[itemprop='name']")];
    if (names.length === 1 && cohort.independent_offer_names.includes(text(names[0]))
      && !offer.querySelector(`${cohort.selectors.address},${cohort.hours_section},${cohort.hero_schedule}`)) offer.remove();
  });
  noticeCopy.querySelectorAll("script").forEach((node) => node.remove());
  const noticeText = text(noticeCopy);
  if (notices(noticeText) || /\b(?:reduced|limited|extended|shortened|revised|changed|updated)\s+(?:(?:store|business)\s+)?hours\b|\bstore\s+(?:is\s+)?clos(?:ed|es|ing|ure)\b/i.test(noticeText)) throw new Error("Unresolved store notice or service qualifier.");
  if (card.getAttribute("itemtype") !== cohort.schema_type || card.getAttribute("itemid") !== cohort.entity_ids[binding.slug]
    || compact(one(card, cohort.selectors.name).getAttribute("content") ?? "") !== compact(identity.name)
    || !addressMatches(one(card, cohort.selectors.address), identity, cohort.selectors)
    || phone(text(one(card, cohort.selectors.phone))) !== identity.phone) throw new Error("Mismatched exact store microdata identity.");
  const address = one(card, cohort.selectors.address);
  if (compact(one(address, "meta[itemprop='streetAddress']").getAttribute("content") ?? "") !== compact(identity.street)
    || one(address, "meta[itemprop='addressLocality']").getAttribute("content") !== identity.locality
    || text(one(address, "[itemprop='addressCountry']")) !== "US") throw new Error("Conflicting structured store address or country.");
  const qualified = (node: Element) => [...node.attributes].some((attribute) => /(?:holiday|special|validfrom|validthrough|valid-from|valid-through|seasonal|closure)/i.test(attribute.name));
  if (qualified(card) || card.querySelector("[itemprop='validFrom'],[itemprop='validThrough'],[itemprop='specialOpeningHoursSpecification'],[itemprop='openingHoursSpecification']")) throw new Error("Unreviewed dated store schedule.");
  const section = one(card, cohort.hours_section);
  const toggles = [...section.querySelectorAll(cohort.toggle)];
  const panels = [...section.querySelectorAll(cohort.panel)];
  const labels = toggles.map((node) => text(node));
  if (!labels.length || labels.length > cohort.toggle_labels.length || labels.some((label, index) => label !== cohort.toggle_labels[index])
    || labels.filter((label) => label === cohort.store_label).length !== 1 || toggles.some((node) => !visible(node)) || panels.length !== toggles.length
    || panels.some((node) => !visible(node))) throw new Error("Unreviewed store versus service disclosure.");
  // The source's is-hidden class is its reviewed user-expandable disclosure.
  // Actual hidden/inert/aria-hidden attributes and hidden descendants still fail.
  const storeIndex = labels.indexOf(cohort.store_label);
  const closureCopy = noticeCopy.cloneNode(true) as HTMLElement;
  [...closureCopy.querySelectorAll(cohort.panel)].forEach((node, index) => { if (index !== storeIndex) node.remove(); });
  // A computed today-status may say Closed before the next normal opening.
  // Remove only the reviewed status-only fields; weekly clocks remain checked.
  closureCopy.querySelectorAll(".RedesignHero-hours .c-hours-today-day-status,.js-intent-core-hours .c-hours-today-day-status").forEach((node) => node.remove());
  if (/\b(?:closed|closing|closures?)\b/i.test(text(closureCopy))) throw new Error("Unreviewed store closure wording.");
  const panel = panels[storeIndex];
  const table = one(panel, cohort.selectors.schedule);
  const rows = [...table.querySelectorAll(cohort.schedule_row)];
  if (rows.length !== 7 || rows.some((row) => !visible(row))) throw new Error("Incomplete disclosed store week.");
  const hours: Hours = {};
  const shortDays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  for (const row of rows) {
    const index = FULL_DAYS.indexOf(text(one(row, cohort.day)));
    const period = text(one(row, cohort.periods)).match(new RegExp(`^${CLOCK}\\s*[-–—]\\s*${CLOCK}$`, "i"));
    if (index < 0 || hours[WEEKDAYS[index]] || !period || row.getAttribute("data-day-of-week-start-index") !== String((index + 1) % 7)
      || row.getAttribute("data-day-of-week-end-index") !== String((index + 1) % 7)) throw new Error("Incomplete or ambiguous disclosed store weekday.");
    const open = clock(period[1]), close = clock(period[2]);
    if (open >= close || row.getAttribute("itemprop") !== "openingHours" || row.getAttribute("content") !== `${shortDays[index]} ${open}-${close}`) throw new Error("Conflicting store visible and microdata hours.");
    hours[WEEKDAYS[index]] = [{ open, close }];
  }
  if (qualified(table) || qualified(panel)) throw new Error("Unreviewed store schedule qualifier.");
  const configs = [...table.querySelectorAll("script.js-hours-config[type='text/data']")];
  let config: Record<string, unknown>;
  try { config = JSON.parse(configs[0]?.textContent ?? ""); } catch { throw new Error("Missing store hours configuration."); }
  const configKeys = ["collapseDays", "dayOfWeekMap", "disableOpenUntil", "disableTodayFirst", "hideSchema", "highlightToday", "highlightTodayBackground", "hours", "open24HoursMessage", "showOpenToday", "twentyFourHourClock", "utcOffsets", "wholeWeekMessage"];
  if (configs.length !== 1 || !config || typeof config !== "object" || Array.isArray(config) || Object.keys(config).some((key) => !configKeys.includes(key))
    // The reviewed source now explicitly keeps schema visible. This does not
    // change any clock; the visible, microdata and machine weeks still agree.
    || configKeys.filter((key) => !["hours", "utcOffsets"].includes(key)).some((key) => config[key] !== null && !(key === "hideSchema" && config[key] === false))) throw new Error("Unreviewed store configuration qualifier.");
  const configured = machineWeek(JSON.stringify(config.hours));
  for (const day of WEEKDAYS) if (JSON.stringify(configured[day]) !== JSON.stringify(hours[day])) throw new Error("Conflicting store configuration hours.");
  const hero = one(card, cohort.hero_schedule);
  const schedules = [table, one(panel, cohort.panel_schedule), hero];
  if (schedules.some(qualified) || (hero.parentElement && qualified(hero.parentElement))) throw new Error("Unreviewed store schedule date qualifier.");
  for (const schedule of schedules) {
    const machine = machineWeek(schedule.getAttribute("data-days"));
    for (const day of WEEKDAYS) if (JSON.stringify(machine[day]) !== JSON.stringify(hours[day])) throw new Error("Conflicting store schedule copies.");
  }
  if ([...card.querySelectorAll(cohort.selectors.schedule)].some((node) => !panels.some((candidate) => candidate.contains(node)))
    || [...card.querySelectorAll("[itemprop='openingHours']")].some((node) => !hero.contains(node) && !panels.some((candidate) => candidate.contains(node)))) throw new Error("Unreviewed extra store schedule.");
  return hours;
}

function microdataPrimaryStoreWeek(document: Document, pageText: string, cohort: Extract<OfficialHoursCohort, { shape: "microdata_primary_store_week" }>, binding: OfficialHoursCohortBinding): Hours {
  const canonical = [...document.querySelectorAll("link[rel='canonical']")];
  const cards = [...document.querySelectorAll(cohort.selectors.card)];
  if (canonical.length !== 1 || canonical[0].getAttribute("href") !== cohort.source_url || cards.length !== 1 || !visible(cards[0])) throw new Error("Missing exact primary store page identity.");
  const card = cards[0], identity = binding.identity;
  // The reviewed family has no JSON-LD; new structured claims need review.
  if (document.querySelector("script[type='application/ld+json']")) throw new Error("Unreviewed additional primary store structured claims.");
  if (card.getAttribute("itemtype") !== cohort.schema_type || card.getAttribute("itemid") !== cohort.entity_ids[binding.slug]
    || compact(text(one(card, cohort.selectors.name))) !== compact(identity.name)
    || !addressMatches(one(card, cohort.selectors.address), identity, cohort.selectors)
    || phone(text(one(card, cohort.selectors.phone))) !== identity.phone) throw new Error("Mismatched exact primary store identity.");
  const address = one(card, cohort.selectors.address);
  if (compact(one(address, "meta[itemprop='streetAddress']").getAttribute("content") ?? "") !== compact(identity.street)) throw new Error("Conflicting primary store street microdata.");
  const country = [...address.querySelectorAll("[itemprop='addressCountry']")];
  if (country.length > 1 || country.some(node => text(node) !== "US")) throw new Error("Conflicting primary store country.");
  const noticeCopy = document.body.cloneNode(true) as HTMLElement;
  noticeCopy.querySelectorAll("script,style,noscript").forEach(node => node.remove());
  const noticeText = `${pageText} ${text(noticeCopy)}`;
  if (/\bclosed\s+(?:on|from|until|through|during|this|every|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d)\b/i.test(noticeText)) throw new Error("Unreviewed dated primary store closure.");
  if (notices(noticeText) || /\b(?:reduced|limited|extended|shortened|revised|changed|updated)\s+(?:(?:store|business)\s+)?hours\b|\bstore\s+(?:is\s+)?clos(?:ed|es|ing|ure)\b/i.test(noticeText)) throw new Error("Unresolved primary store notice or service qualifier.");
  const qualified = (node: Element) => [...node.attributes].some(attr => /holiday|special|validfrom|validthrough|valid-from|valid-through|seasonal|closure/i.test(attr.name));
  const qualifiedSchedulePart = (node: Element) => qualified(node) || [...node.attributes].some(attr =>
    /(?:date|service|pharmacy|deli|pickup|pick-up|delivery|takeout|take-out|kitchen|brunch|admission)/i.test(attr.name)
    || (/(?:hours|scope|schedule|type)/i.test(attr.name) && /(?:holiday|special|seasonal|closure|service|pharmacy|deli|pickup|pick-up|delivery|takeout|take-out|kitchen|brunch|admission)/i.test(attr.value)));
  const qualifiedScheduleTree = (node: Element) => [node, ...node.querySelectorAll("*")].some(qualifiedSchedulePart);

  if (qualified(card) || card.querySelector("[itemprop='validFrom'],[itemprop='validThrough'],[itemprop='specialOpeningHoursSpecification'],[itemprop='openingHoursSpecification']")) throw new Error("Unreviewed dated primary store schedule.");
  const store = one(card, ".Core-storeHours");
  const toggle = one(card, ".Core-toggleHoursBtn");
  const labels = [...card.querySelectorAll(".Core-sectionTitle")].filter(node => text(node) === "Store Hours");
  if (labels.length !== 1 || !visible(labels[0])) throw new Error("Missing or duplicate Store Hours label.");
  const label = labels[0];
  if (text(label) !== "Store Hours" || text(toggle) !== "Toggle store hours" || toggle.getAttribute("data-hours") !== "js-store-hours" || !store.classList.contains("js-store-hours") || [store, toggle, label].some(qualified)) throw new Error("Unreviewed primary Store Hours disclosure.");
  const outside = document.body.cloneNode(true) as HTMLElement;
  outside.querySelectorAll("script,style,noscript,.Core-storeHours,.Hero-hoursTodayRow,.Core-storeToday").forEach(node => node.remove());
  [...outside.querySelectorAll(".Core-sectionTitle")].filter(node => text(node) === "Store Hours").forEach(node => node.remove());
  if (/\b(?:store|grocery|business|opening|holiday|special|seasonal|pharmacy|deli)\s+hours\b/i.test(text(outside))
    || new RegExp(`\\bhours\\s*:?\\s*(?:${CLOCK}|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)`, "i").test(text(outside))) throw new Error("Unreviewed unbound primary store or service timetable.");
  const table = one(card, cohort.selectors.schedule);
  if (!store.contains(table) || card.querySelectorAll(".js-hours-table").length !== 1) throw new Error("Extra or unbound primary store schedule.");
  if (qualifiedScheduleTree(table)) throw new Error("Unreviewed primary store table date or service qualifier.");
  const rows = [...table.querySelectorAll(cohort.schedule_row)], hours: Hours = {};
  if (rows.length !== 7 || rows.some(row => !visible(row))) throw new Error("Incomplete visible primary store week.");
  const short = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  for (const row of rows) {
    if (qualifiedScheduleTree(row)) throw new Error("Unreviewed primary store weekday date or service qualifier.");
    const index = FULL_DAYS.indexOf(text(one(row, cohort.day)));
    const range = text(one(row, cohort.periods)).match(new RegExp(`^${CLOCK}\\s*[-–—]\\s*${CLOCK}$`, "i"));
    if (index < 0 || hours[WEEKDAYS[index]] || !range || row.getAttribute("data-day-of-week-start-index") !== String((index + 1) % 7) || row.getAttribute("data-day-of-week-end-index") !== String((index + 1) % 7)) throw new Error("Incomplete or duplicate primary store weekday.");
    const open = clock(range[1]), close = clock(range[2]);
    if (open >= close || row.getAttribute("itemprop") !== "openingHours" || row.getAttribute("content") !== `${short[index]} ${open}-${close}`) throw new Error("Conflicting primary store visible and microdata hours.");
    hours[WEEKDAYS[index]] = [{ open, close }];
  }
  const hero = one(card, cohort.hero_schedule), panel = one(card, cohort.panel_schedule);
  for (const schedule of [table, hero, panel]) {
    if (qualified(schedule) || (schedule.parentElement && qualified(schedule.parentElement))) throw new Error("Unreviewed primary store date qualifier.");
    const machine = machineWeek(schedule.getAttribute("data-days"));
    for (const day of WEEKDAYS) if (JSON.stringify(machine[day]) !== JSON.stringify(hours[day])) throw new Error("Conflicting primary store schedule copies.");
  }
  // Both repeated today widgets contain their own full seven-day microdata.
  // A changed visible or structured copy must not hide behind a matching array.
  for (const widget of [hero, panel]) {
    const repeated = [...widget.querySelectorAll("[itemprop='openingHours']")], seen = new Set<number>();
    if (repeated.length !== 7) throw new Error("Incomplete repeated primary store week.");
    for (const row of repeated) {
      const claim = (row.getAttribute("content") ?? "").match(/^(Mo|Tu|We|Th|Fr|Sa|Su) (\d{2}:\d{2})-(\d{2}:\d{2})$/);
      const index = claim ? short.indexOf(claim[1]) : -1;
      const range = text(row).match(new RegExp(`^${CLOCK}\\s*[-–—]\\s*${CLOCK}$`, "i"));
      if (index < 0 || seen.has(index) || !range || !visible(row) || qualifiedScheduleTree(row)
        || claim![2] !== hours[WEEKDAYS[index]]![0].open || claim![3] !== hours[WEEKDAYS[index]]![0].close
        || clock(range[1]) !== claim![2] || clock(range[2]) !== claim![3]) throw new Error("Conflicting repeated primary store hours.");
      seen.add(index);
    }
  }
  const configs = [...table.querySelectorAll("script.js-hours-config[type='application/json']")];
  let config: Record<string, unknown>;
  try { config = JSON.parse(configs[0]?.textContent ?? ""); } catch { throw new Error("Missing primary store hours configuration."); }
  // These known controls only select grouping, ordering or decoration. They
  // cannot change the required full visible week or any corroborating clock.
  const booleanPresentationKeys = ["collapseDays", "disableOpenUntil", "disableTodayFirst", "hideSchema", "highlightToday", "showOpenToday", "twentyFourHourClock"];
  const nullableBoolean = (value: unknown) => value == null || typeof value === "boolean";
  const background = config?.highlightTodayBackground;
  const start = config?.weekStartsOn;
  // Mapping/format/message overrides can relabel weekdays or replace factual
  // time/status wording, so they retain their reviewed null state.
  const semanticNullKeys = ["dayOfWeekMap", "open24HoursMessage", "timeFormatString", "wholeWeekMessage"];
  const knownKeys = [...booleanPresentationKeys, ...semanticNullKeys, "highlightTodayBackground", "weekStartsOn", "hours", "utcOffsets"];
  if (configs.length !== 1 || !config || typeof config !== "object" || Array.isArray(config)
    || booleanPresentationKeys.some(key => !nullableBoolean(config[key]))
    || !(background == null || typeof background === "boolean" || (typeof background === "string" && background.length > 0 && background.length <= 120 && !/[\u0000-\u001f]/.test(background)))
    || !(start == null || (typeof start === "number" && Number.isInteger(start) && start >= 0 && start <= 6))
    || semanticNullKeys.some(key => config[key] !== null)
    || Object.keys(config).some(key => !knownKeys.includes(key))) throw new Error("Unreviewed primary store configuration qualifier.");
  const configured = machineWeek(JSON.stringify(config.hours));
  for (const day of WEEKDAYS) if (JSON.stringify(configured[day]) !== JSON.stringify(hours[day])) throw new Error("Conflicting primary store configuration hours.");
  // Corporate gift-card support and nearby teasers are not grocery timetables.
  // Any additional structured store/service week remains blocking.
  if ([...card.querySelectorAll("[itemprop='openingHours']")].some(node => ![table, hero, panel].some(scope => scope.contains(node)))) throw new Error("Unreviewed extra primary store or service schedule.");
  return hours;
}

/** One already bounded source receipt, separate exact listing facts. No I/O. */
export function parseOfficialHoursCohort(document: Document, pageText: string, cohort: OfficialHoursCohort, binding: OfficialHoursCohortBinding): Hours {
  validateCohort(cohort, binding);
  return cohort.shape === "shared_daily_contact_card" ? sharedDaily(document, pageText, cohort) : cohort.shape === "microdata_store_week" ? microdataStoreWeek(document, pageText, cohort, binding) : cohort.shape === "microdata_primary_store_week" ? microdataPrimaryStoreWeek(document, pageText, cohort, binding) : jsonldWeek(document, pageText, cohort, binding);
}
