import { afterEach, describe, expect, it, vi } from "vitest";
import { eventSourceStatement, ticketingSourcesOn } from "./source-statement";

afterEach(() => vi.unstubAllEnvs());

describe("ticketingSourcesOn", () => {
  it("is off when the settings are missing, as in production on Nov 9, 2026", () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    vi.stubEnv("BANDSINTOWN_ENABLED", "");
    vi.stubEnv("BANDSINTOWN_APP_ID", "");
    expect(ticketingSourcesOn()).toEqual({ ticketmaster: false, bandsintown: false });
  });

  it("turns on with the same settings the feed registry requires", () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "key");
    vi.stubEnv("BANDSINTOWN_ENABLED", "1");
    vi.stubEnv("BANDSINTOWN_APP_ID", "app");
    expect(ticketingSourcesOn()).toEqual({ ticketmaster: true, bandsintown: true });
  });

  it("keeps Bandsintown off when it has an app id but is not enabled", () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    vi.stubEnv("BANDSINTOWN_ENABLED", "");
    vi.stubEnv("BANDSINTOWN_APP_ID", "app");
    expect(ticketingSourcesOn().bandsintown).toBe(false);
  });
});

describe("eventSourceStatement", () => {
  it("does not credit a ticketing source that is switched off", () => {
    // Production on Nov 9, 2026: neither key was set, and the footer still
    // named both.
    const statement = eventSourceStatement({ ticketmaster: false, bandsintown: false });
    expect(statement).not.toMatch(/ticketmaster|bandsintown/i);
    expect(statement).toContain("Frederick County Public Libraries");
    expect(statement).toContain("Downtown Frederick Partnership");
    expect(statement.endsWith("Live feeds are checked about every 15 minutes.")).toBe(true);
  });

  it("names each ticketing source once it is on", () => {
    expect(eventSourceStatement({ ticketmaster: true, bandsintown: false }))
      .toContain("Ticketmaster adds ticketed concerts and Frederick Keys home games.");
    const both = eventSourceStatement({ ticketmaster: true, bandsintown: true });
    expect(both).toContain("Bandsintown adds touring dates for tracked artists.");
    expect(both.indexOf("Ticketmaster")).toBeLessThan(both.indexOf("Bandsintown"));
  });

  it("follows the copy rules for user-facing text", () => {
    const statement = eventSourceStatement({ ticketmaster: true, bandsintown: true });
    expect(statement).not.toContain("—");
    for (const sentence of statement.split(/(?<=\.)\s+/)) {
      expect(sentence).toMatch(/^[A-Z].*\.$/);
    }
  });
});
