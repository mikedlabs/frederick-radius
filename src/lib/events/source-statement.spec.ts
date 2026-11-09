import { afterEach, describe, expect, it, vi } from "vitest";
import { eventSourceStatement, ticketingSourcesOn } from "./source-statement";

afterEach(() => vi.unstubAllEnvs());

const ALL_OFF = { ticketmaster: false, bandsintown: false, seatgeek: false, eventbrite: false };
const ALL_ON = { ticketmaster: true, bandsintown: true, seatgeek: true, eventbrite: true };

function clearTicketingEnv() {
  for (const name of [
    "TICKETMASTER_API_KEY",
    "BANDSINTOWN_ENABLED",
    "BANDSINTOWN_APP_ID",
    "SEATGEEK_ENABLED",
    "SEATGEEK_CLIENT_ID",
    "EVENTBRITE_ENABLED",
    "EVENTBRITE_TOKEN",
  ]) vi.stubEnv(name, "");
}

describe("ticketingSourcesOn", () => {
  it("is off when the settings are missing, as in production on Nov 9, 2026", () => {
    clearTicketingEnv();
    expect(ticketingSourcesOn()).toEqual(ALL_OFF);
  });

  it("turns on with the same settings the feed registry requires", () => {
    clearTicketingEnv();
    vi.stubEnv("TICKETMASTER_API_KEY", "key");
    vi.stubEnv("BANDSINTOWN_ENABLED", "1");
    vi.stubEnv("BANDSINTOWN_APP_ID", "app");
    vi.stubEnv("SEATGEEK_ENABLED", "1");
    vi.stubEnv("SEATGEEK_CLIENT_ID", "client");
    vi.stubEnv("EVENTBRITE_ENABLED", "1");
    vi.stubEnv("EVENTBRITE_TOKEN", "token");
    expect(ticketingSourcesOn()).toEqual(ALL_ON);
  });

  it("keeps Bandsintown off when it has an app id but is not enabled", () => {
    clearTicketingEnv();
    vi.stubEnv("BANDSINTOWN_APP_ID", "app");
    expect(ticketingSourcesOn().bandsintown).toBe(false);
  });

  it("treats a credential of only spaces as missing, as the adapters do", () => {
    clearTicketingEnv();
    vi.stubEnv("TICKETMASTER_API_KEY", "   ");
    vi.stubEnv("SEATGEEK_ENABLED", "1");
    vi.stubEnv("SEATGEEK_CLIENT_ID", " ");
    expect(ticketingSourcesOn()).toEqual(ALL_OFF);
  });
});

describe("eventSourceStatement", () => {
  it("does not credit a ticketing source that is switched off", () => {
    // Production on Nov 9, 2026: neither key was set, and the footer still
    // named Ticketmaster and Bandsintown.
    const statement = eventSourceStatement(ALL_OFF);
    expect(statement).not.toMatch(/ticketmaster|bandsintown|seatgeek|eventbrite/i);
    expect(statement).toContain("Frederick County Public Libraries");
    expect(statement).toContain("Downtown Frederick Partnership");
    expect(statement.endsWith("Live feeds are checked about every 15 minutes.")).toBe(true);
  });

  it("names each ticketing source once it is on, and only that one", () => {
    const ticketmaster = eventSourceStatement({ ...ALL_OFF, ticketmaster: true });
    expect(ticketmaster).toContain("Ticketmaster adds ticketed concerts and Frederick Keys home games.");
    expect(ticketmaster).not.toMatch(/bandsintown|seatgeek|eventbrite/i);
    expect(eventSourceStatement({ ...ALL_OFF, bandsintown: true }))
      .toContain("Bandsintown adds touring dates for tracked artists.");
    expect(eventSourceStatement({ ...ALL_OFF, seatgeek: true }))
      .toContain("SeatGeek adds ticketed concerts and shows.");
    expect(eventSourceStatement({ ...ALL_OFF, eventbrite: true }))
      .toContain("Eventbrite adds events from a reviewed list of organizers.");
    const all = eventSourceStatement(ALL_ON);
    expect(all.indexOf("Ticketmaster")).toBeLessThan(all.indexOf("Bandsintown"));
  });

  it("follows the copy rules for user-facing text", () => {
    const statement = eventSourceStatement(ALL_ON);
    expect(statement).not.toContain("—");
    for (const sentence of statement.split(/(?<=\.)\s+/)) {
      expect(sentence).toMatch(/^[A-Z].*\.$/);
    }
  });
});
