import { describe, expect, it } from "vitest";
import { needsWebsiteLink, phoneBarHasWebsite } from "./place-phone-bar";

describe("place phone bar and the official website", () => {
  const site = "https://example.org";

  it("ends on Website for a place with a website, no email and no commerce action", () => {
    expect(phoneBarHasWebsite({ website: site, email: null }, false)).toBe(true);
    expect(needsWebsiteLink({ website: site, email: null }, false)).toBe(false);
  });

  it("keeps a plain website link when an email takes the bar's last cell", () => {
    expect(phoneBarHasWebsite({ website: site, email: "hello@example.org" }, false)).toBe(false);
    expect(needsWebsiteLink({ website: site, email: "hello@example.org" }, false)).toBe(true);
  });

  it("keeps a plain website link when an order or reserve action takes the bar's last cell", () => {
    expect(phoneBarHasWebsite({ website: site, email: null }, true)).toBe(false);
    expect(needsWebsiteLink({ website: site, email: null }, true)).toBe(true);
  });

  it("needs no link when the place has no website at all", () => {
    expect(needsWebsiteLink({ website: null, email: "hello@example.org" }, true)).toBe(false);
    expect(needsWebsiteLink({}, false)).toBe(false);
  });
});
