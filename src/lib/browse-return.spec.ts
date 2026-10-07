import { describe, expect, it } from "vitest";
import { browseReturnFromLocation, browseReturnLabel, normalizeBrowseReturnTo, withBrowseReturnTo } from "./browse-return";

describe("connected browsing returns", () => {
  it("returns from an event outing to the canonical detail and its exact listing origin", () => {
    const listing = "/events?in=frederick&cat=music";
    const event = withBrowseReturnTo("/events/runtime-concert", listing);
    expect(browseReturnLabel(event)).toBe("Back to the event");
    expect(new URL(withBrowseReturnTo("/plan?event=runtime-concert", event), "https://example.test").searchParams.get("returnTo")).toBe(event);
    expect(browseReturnFromLocation(new URL(event, "https://example.test"))).toBe(listing);
    for (const invalid of ["/events/a/secret", "/events/%2f%2fevil", "/events/a%5cfoo", "/events/-invalid", "/events/constructor", "/events/prototype", `/events/${"a".repeat(201)}`]) expect(normalizeBrowseReturnTo(invalid)).toBeNull();
  });
  it("preserves the full accepted event slug length without accepting reserved detail returns", () => {
    expect(normalizeBrowseReturnTo(`/events/${"a".repeat(200)}`)).toBe(`/events/${"a".repeat(200)}`);
    expect(browseReturnLabel("/events/constructor")).toBeNull();
    expect(browseReturnLabel("/events/prototype")).toBeNull();
    expect(withBrowseReturnTo("/plan", "/events/prototype")).toBe("/plan");
  });

  it("keeps Tonight intent and town through a full detail visit", () => {
    const tonight = "/today/tonight?intent=pizza&in=brunswick";
    expect(browseReturnLabel(tonight)).toBe("Back to Tonight");
    expect(new URL(withBrowseReturnTo("/places/example", tonight), "https://example.test").searchParams.get("returnTo")).toBe(tonight);
    expect(normalizeBrowseReturnTo("/today/tonight/unsafe")).toBeNull();
  });
  it("keeps a search's geography, filters, and exact map return together", () => {
    const map = "/map?c=-77.5,39.3,12&q=coffee&in=brunswick";
    const search = `/search?q=coffee&in=brunswick&returnTo=${encodeURIComponent(map)}`;
    const destination = withBrowseReturnTo("/places/example", search);
    expect(new URL(destination, "https://example.test").searchParams.get("returnTo")).toBe(search);
    expect(browseReturnFromLocation(new URL(search, "https://example.test"))).toBe(search);
    expect(browseReturnLabel(search)).toBe("Back to search results");
  });

  it.each(["//evil.test/map", "https://evil.test/map", "/maple", "/places/a", "/api/private", "/%2f%2fevil.test/map", "/search%5cfoo", "/search?x=%00", "x".repeat(8193)])("rejects unsafe or non-listing return paths: %s", (input) => {
    expect(normalizeBrowseReturnTo(input)).toBeNull();
  });

  it("returns to Saved after a full detail navigation and preserves event filters", () => {
    expect(withBrowseReturnTo("/events/example", "/my-radius")).toBe("/events/example?returnTo=%2Fmy-radius");
    expect(browseReturnLabel("/my-radius")).toBe("Back to saved");
    expect(normalizeBrowseReturnTo("/events?date=2026-09-07&in=thurmont&cat=music#results")).toBe("/events?date=2026-09-07&in=thurmont&cat=music#results");
  });

  it("returns to the exact edited outing from a stop's detail", () => {
    const plan = "/plan?p=edited-token&in=brunswick&returnTo=%2Fsearch%3Fq%3Dcoffee";
    expect(browseReturnLabel(plan)).toBe("Back to your plan");
    expect(new URL(withBrowseReturnTo("/places/beans", plan), "https://example.test").searchParams.get("returnTo")).toBe(plan);
  });

  it("carries a listing through a detail's place sheet without accepting external destinations", () => {
    expect(browseReturnFromLocation(new URL("https://example.test/events/a?returnTo=%2Fmy-radius"))).toBe("/my-radius");
    expect(withBrowseReturnTo("https://evil.test/places/a", "/my-radius")).toBe("https://evil.test/places/a");
  });
});
