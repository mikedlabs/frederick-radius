import { describe, expect, it } from "vitest";
import type { SearchResult } from "@/lib/search/index";
import {
  claimTemporaryMapboxRetrieve,
  expireTemporaryMapboxSuggestions,
  sameTemporaryMapboxRetrieve,
  settleTemporaryMapboxSuggestions,
  temporaryMapboxRetrieveIsCurrent,
} from "./mapboxTemporarySuggestionState";

const first = {
  type: "place",
  id: "mapbox:first",
  title: "First",
  subtitle: "Temporary Mapbox result",
  href: "#",
  temporary: true,
  provider: "Mapbox",
} satisfies SearchResult;

const second = {
  ...first,
  id: "mapbox:second",
  title: "Second",
} satisfies SearchResult;

const local = {
  type: "place",
  id: "place:local",
  title: "Local",
  subtitle: "Radius place",
  href: "/places/local",
} satisfies SearchResult;

describe("temporary Mapbox suggestion lifecycle", () => {
  it("allows only one retrieve claim until the active claim is released", () => {
    const firstClaim = { mapboxId: "first", sessionToken: "session-one" };
    const claimed = claimTemporaryMapboxRetrieve(null, firstClaim);
    const raced = claimTemporaryMapboxRetrieve(claimed.claim, {
      mapboxId: "second",
      sessionToken: "session-one",
    });

    expect(claimed).toEqual({ accepted: true, claim: firstClaim });
    expect(raced).toEqual({ accepted: false, claim: firstClaim });
    expect(sameTemporaryMapboxRetrieve(raced.claim, firstClaim)).toBe(true);
    expect(
      sameTemporaryMapboxRetrieve(raced.claim, {
        mapboxId: "first",
        sessionToken: "new-session",
      }),
    ).toBe(false);
  });

  it("keeps only the retrieved cache-backed row after success", () => {
    expect(
      settleTemporaryMapboxSuggestions([first, second, local], first.id, true),
    ).toEqual([first, local]);
  });

  it("removes every terminal-session row after an ambiguous failure", () => {
    expect(
      settleTemporaryMapboxSuggestions([first, second, local], first.id, false),
    ).toEqual([local]);
  });

  it("rejects a retrieve response after a newer search request starts", () => {
    const claim = { mapboxId: "first", sessionToken: "session-one" };

    expect(temporaryMapboxRetrieveIsCurrent(claim, claim, 4, 4)).toBe(true);
    expect(temporaryMapboxRetrieveIsCurrent(claim, claim, 5, 4)).toBe(false);
    expect(
      temporaryMapboxRetrieveIsCurrent(
        { mapboxId: "second", sessionToken: "session-two" },
        claim,
        4,
        4,
      ),
    ).toBe(false);
  });

  it("removes expired provider rows while preserving Radius results", () => {
    expect(expireTemporaryMapboxSuggestions([first, second, local])).toEqual([
      local,
    ]);
  });
});
