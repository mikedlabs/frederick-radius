import { describe, expect, it } from "vitest";
import { municipalCheckedDate, municipalOfficeHours, normalizeMunicipalContact, normalizeMunicipalContacts } from "./municipal-civic-contact";

const NOW = new Date("2026-10-12T15:00:00.000Z");
const HOURS = "Monday-Friday 8AM-4PM";
const contact = { label: "Town Hall", hours: HOURS, phone: "301-898-3800", address: "605 S. Main Street" };

describe("municipal contact boundary", () => {
  it.each([
    "Council Meetings are held on the second Tuesday of every month at 7:00 pm. Planning & Zoning Meetings are held the first Monday of the month as needed at 6:00 PM.",
    "Planning hearings are held at 6:00 PM as needed.",
    "Council: Tuesday 7 PM",
    "Appointments Tuesday 7 PM",
    "First Monday 6 PM",
    "Today's hours are 8 AM to 4 PM",
    "Unknown",
  ])("omits unsupported office hours without losing the resident's call or address (%s)", (hours) => {
    const cleaned = normalizeMunicipalContact({ ...contact, hours });
    expect(cleaned).toEqual({ label: contact.label, phone: contact.phone, address: contact.address });
  });
  it("accepts reusable office hours and keeps source identity and clocks unchanged", () => {
    const source = { url: "https://woodsboro.org/", fetchedAt: "2026-08-18T15:34:31.695Z" };
    const row = { slug: "woodsboro", source, townHall: contact, extras: [{ label: "Council & planning meetings", website: source.url }] };
    const cleaned = normalizeMunicipalContacts(row);
    expect(cleaned.townHall).toEqual(contact);
    expect(cleaned.source).toBe(source);
    expect(cleaned.extras).toEqual(row.extras);
    expect(row.townHall).toBe(contact);
  });
});

describe("municipal office-hour evidence", () => {
  it("allows a recently checked weekly schedule without asserting open or closed now", () => {
    expect(municipalOfficeHours(contact, "2026-10-11T15:00:00.000Z", NOW)).toEqual({
      state: "current", hours: HOURS, checkedDate: "Oct 11, 2026",
    });
  });
  it("keeps a dated old schedule as reference rather than current hours", () => {
    expect(municipalOfficeHours(contact, "2026-08-18T15:34:31.695Z", NOW)).toEqual({
      state: "stale", hours: HOURS, checkedDate: "Aug 18, 2026",
    });
  });
  it.each([undefined, "", "invalid", "2026-10-12T15:06:00.000Z"])("withholds hours when their check clock is missing, invalid or implausibly future (%s)", (checkedAt) => {
    expect(municipalOfficeHours(contact, checkedAt, NOW)).toEqual({ state: "unknown", checkedDate: null });
    expect(municipalCheckedDate(checkedAt, NOW)).toBeNull();
  });
  it("uses the existing inclusive seven-day limit and five-minute skew tolerance", () => {
    expect(municipalOfficeHours(contact, "2026-10-05T15:00:00.000Z", NOW).state).toBe("current");
    expect(municipalOfficeHours(contact, "2026-10-05T14:59:59.000Z", NOW).state).toBe("stale");
    expect(municipalOfficeHours(contact, "2026-10-12T15:05:00.000Z", NOW).state).toBe("current");
    expect(municipalOfficeHours(contact, "2026-10-12T15:05:00.001Z", NOW).state).toBe("unknown");
  });
});
