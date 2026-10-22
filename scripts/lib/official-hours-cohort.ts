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

/** One already bounded source receipt, separate exact listing facts. No I/O. */
export function parseOfficialHoursCohort(document: Document, pageText: string, cohort: OfficialHoursCohort, binding: OfficialHoursCohortBinding): Hours {
  validateCohort(cohort, binding);
  return cohort.shape === "shared_daily_contact_card" ? sharedDaily(document, pageText, cohort) : jsonldWeek(document, pageText, cohort, binding);
}
