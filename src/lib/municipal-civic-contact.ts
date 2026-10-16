import { isHoursFresh } from "@/lib/hours-freshness";

export type CivicContact = {
  label: string;
  phone?: string;
  website?: string;
  /** Office opening hours, never council or planning meeting times. */
  hours?: string;
  schedule?: string;
  address?: string;
  about?: string;
};

const CONTACT_FIELDS = ["townHall", "publicWorks", "police", "trashRecycling", "permits", "utilities"] as const;
const TEXT_FIELDS = ["phone", "website", "hours", "schedule", "address", "about"] as const;
const UNKNOWN_VALUE = /^(?:n\/?a|none|unknown|not (?:available|listed|posted|published|specified)|hours not (?:available|posted|published))\.?$/i;
const MEETING_HOURS = /\b(?:meetings?|hearings?|sessions?|agenda|council|appointments?|as needed)\b|\bplanning\s*(?:&|and)\s*zoning\b|\b(?:first|second|third|fourth|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\btoday(?:['’]s)?\b/i;

function fact(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
  return text && !UNKNOWN_VALUE.test(text) ? text : undefined;
}

/** Shared write/read boundary: a published meeting time is not office hours. */
export function normalizeMunicipalContact(raw: unknown): CivicContact | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const label = fact(row.label);
  if (!label) return undefined;
  const contact: CivicContact = { label };
  for (const field of TEXT_FIELDS) {
    const value = fact(row[field]);
    if (value && (field !== "hours" || !MEETING_HOURS.test(value))) contact[field] = value;
  }
  return contact;
}

/** Preserve record provenance and identity while normalizing its contacts. */
export function normalizeMunicipalContacts<T extends Record<string, unknown>>(raw: T): T {
  const result: Record<string, unknown> = { ...raw };
  for (const field of CONTACT_FIELDS) {
    if (!(field in raw)) continue;
    const contact = normalizeMunicipalContact(raw[field]);
    if (contact) result[field] = contact;
    else delete result[field];
  }
  if (Array.isArray(raw.extras)) {
    result.extras = raw.extras.map(normalizeMunicipalContact).filter((contact) => Boolean(contact));
  }
  return result as T;
}

export function municipalCheckedDate(checkedAt: string | undefined, now = new Date()): string | null {
  const timestamp = Date.parse(checkedAt ?? "");
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 5 * 60_000) return null;
  return new Date(timestamp).toLocaleDateString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
  });
}

/** Availability policy, not a claim that an office is open or closed now. */
export function municipalOfficeHours(contact: CivicContact, checkedAt: string | undefined, now = new Date()) {
  const checkedDate = municipalCheckedDate(checkedAt, now);
  if (!contact.hours || !checkedDate) return { state: "unknown" as const, checkedDate };
  return { state: isHoursFresh(checkedAt, now) ? "current" as const : "stale" as const, hours: contact.hours, checkedDate };
}
