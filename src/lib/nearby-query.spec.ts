import { describe, expect, it } from "vitest";
import {
  changeNearbyQuery,
  hasNearbyCategoryBackStep,
  NEARBY_CATEGORY_HISTORY_KEY,
  nearbyHistoryState,
  nearbyQueryHref,
  readNearbyQuery,
} from "./nearby-query";

const read = (query: string) => readNearbyQuery(new URLSearchParams(query));

describe("Nearby return state", () => {
  it("round-trips the complete answer through a full-page return URL", () => {
    const state = read("c=food&facet=italian&open=1&closing=1&sort=rated&in=brunswick");
    const href = nearbyQueryHref("/nearby?returnTo=%2Ftoday%3Fin%3Dcounty#results", state)!;
    const url = new URL(href, "https://example.test");
    expect(readNearbyQuery(url.searchParams)).toEqual({
      cravingKey: "food", facetKey: "italian", openOnly: true,
      closingSoonOnly: true, sort: "rated", scope: "town:brunswick",
    });
    expect(url.searchParams.get("returnTo")).toBe("/today?in=county");
    expect(url.hash).toBe("#results");
    expect([...url.searchParams.keys()]).toEqual(["returnTo", "c", "facet", "open", "closing", "sort", "in"]);
  });

  it("keeps a same-URL sheet traversal from clearing facet or urgency", () => {
    const beforeSheet = read("c=food&facet=pizza&closing=1&sort=nearest&in=frederick");
    const href = nearbyQueryHref("/nearby", beforeSheet)!;
    expect(readNearbyQuery(new URL(href, "https://example.test").searchParams)).toEqual(beforeSheet);
  });

  it("honors explicit county scope ahead of both a legacy town and saved scope", () => {
    expect(readNearbyQuery({ c: "shops", in: "county", town: "brunswick" }, "town:frederick").scope).toBe("county");
    expect(readNearbyQuery({ c: "shops" }, "town:frederick").scope).toBe("town:frederick");
  });

  it("normalizes legacy town links into the canonical scope parameter", () => {
    const state = readNearbyQuery({ c: "shops", facet: "book-store", town: "brunswick" }, "town:frederick");
    const url = new URL(nearbyQueryHref("/nearby?town=brunswick", state)!, "https://example.test");
    expect(url.searchParams.get("in")).toBe("brunswick");
    expect(url.searchParams.has("town")).toBe(false);
    expect(readNearbyQuery(url.searchParams).scope).toBe("town:brunswick");
  });

  it.each(["", "unknown-town", "constructor", "https://evil.test"])("does not revive a saved town for invalid explicit scope %s", (value) => {
    expect(readNearbyQuery({ c: "shops", in: value, town: "brunswick" }, "town:frederick").scope).toBe("county");
  });

  it("keeps near-me as a preference without publishing device coordinates or live facts", () => {
    const state = read("c=coffee&in=nearme&sort=nearest");
    expect(nearbyQueryHref("/nearby", state)).toBe("/nearby?c=coffee&sort=nearest&in=nearme");
  });

  it("resets category-specific facet and urgency while keeping the existing sort/open preferences", () => {
    const next = changeNearbyQuery(read("c=shops&facet=book-store&open=1&closing=1&sort=rated&in=county"), { cravingKey: "drinks" });
    expect(next).toEqual({ cravingKey: "drinks", facetKey: null, openOnly: true, closingSoonOnly: false, sort: "rated", scope: "county" });
  });

  it("changes only the requested refinement and leaves the chosen geography intact", () => {
    const previous = read("c=shops&facet=thrift&open=1&sort=rated&in=thurmont");
    expect(changeNearbyQuery(previous, { facetKey: "book-store" })).toEqual({ ...previous, facetKey: "book-store" });
    expect(changeNearbyQuery(previous, { scope: "county" })).toEqual({ ...previous, scope: "county" });
  });

  it.each(["constructor", "toString", "prototype", "missing-craving"])("treats invalid craving %s as the picker", (c) => {
    expect(readNearbyQuery({ c, facet: "book-store", open: "1", closing: "1", sort: "rated" })).toEqual({
      cravingKey: null, facetKey: null, openOnly: false, closingSoonOnly: false, sort: "smart", scope: null,
    });
  });

  it("accepts only facets belonging to the selected craving", () => {
    expect(read("c=shops&facet=italian").facetKey).toBeNull();
    expect(read("c=food&facet=italian").facetKey).toBe("italian");
    expect(read("c=food&facet=coffee").facetKey).toBeNull();
    expect(read("c=dinner&facet=italian").facetKey).toBeNull();
    expect(read("c=drinks&facet=bar").facetKey).toBe("bar");
  });

  it("ignores invalid flags/sort and inapplicable lodging hours filters", () => {
    expect(read("c=shops&open=true&closing=yes&sort=constructor")).toMatchObject({ openOnly: false, closingSoonOnly: false, sort: "smart" });
    expect(read("c=stay&open=1&closing=1&sort=rated")).toMatchObject({ openOnly: false, closingSoonOnly: false, sort: "rated" });
  });

  it("reads repeated Next query values consistently with URLSearchParams", () => {
    const values = { c: ["shops", "drinks"], facet: ["book-store", "bar"], in: ["county", "brunswick"] };
    expect(readNearbyQuery(values)).toEqual(read("c=shops&c=drinks&facet=book-store&facet=bar&in=county&in=brunswick"));
  });

  it("preserves unrelated history metadata without bypassing Next's native URL adapter", () => {
    const tree = { segment: "nearby" };
    const original = { __NA: true, _N: true, __PRIVATE_NEXTJS_INTERNALS_TREE: tree, __frederickRadiusLayer: "sheet:1", request: { origin: "/today" } };
    expect(nearbyHistoryState(original)).toEqual({ __PRIVATE_NEXTJS_INTERNALS_TREE: tree, __frederickRadiusLayer: "sheet:1", request: { origin: "/today" } });
    expect(original.__NA).toBe(true);
    expect(nearbyHistoryState(null)).toEqual({});
  });

  it("recognizes only a real internal category Back marker", () => {
    expect(hasNearbyCategoryBackStep({ [NEARBY_CATEGORY_HISTORY_KEY]: true })).toBe(true);
    for (const raw of [null, undefined, {}, { [NEARBY_CATEGORY_HISTORY_KEY]: "true" }, { [NEARBY_CATEGORY_HISTORY_KEY]: false }]) {
      expect(hasNearbyCategoryBackStep(raw)).toBe(false);
    }
    expect(nearbyHistoryState({ [NEARBY_CATEGORY_HISTORY_KEY]: true, __NA: true }))
      .toEqual({ [NEARBY_CATEGORY_HISTORY_KEY]: true });
  });

  it("never rewrites a different route during a delayed scope event", () => {
    expect(nearbyQueryHref("/places/books", read("c=shops"))).toBeNull();
  });
});
