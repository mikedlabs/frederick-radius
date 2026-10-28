import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  splitBestMatch,
  firstSafeOfficialAnswerHref,
  exactQuestionLookupQuery,
  isExactQuestionPlaceResult,
  isCompoundLookup,
  isNaturalLanguageRequest,
  safeOfficialAnswerHref,
  unifiedRequestDestination,
  visibleFindQuickAnswers,
} from "./SearchOverlay";
import { searchCivicActions } from "@/lib/search/civic";
import { qualifiedSearchIndex } from "@/lib/search/index";
import { findQuickAnswers } from "@/lib/answers/intents";

describe("one Find doorway", () => {
  it("keeps names and categories in deterministic search", () => {
    expect(isNaturalLanguageRequest("Gravel and Grind")).toBe(false);
    expect(isNaturalLanguageRequest("coffee")).toBe(false);
    expect(isNaturalLanguageRequest("coffee near me")).toBe(false);
    expect(isNaturalLanguageRequest("find coffee near me")).toBe(false);

    expect(
      unifiedRequestDestination({
        query: "Gravel and Grind",
        bestHref: "/places/gravel-and-grind-frederick",
        status: "done",
      }),
    ).toBe("/places/gravel-and-grind-frederick");
  });

  it("sends questions and open-ended decisions to reasoning automatically", () => {
    const questions = [
      "Where should I get breakfast?",
      "help me plan a rainy afternoon",
      "I need somewhere quiet for dinner",
      "anything fun tomorrow night",
      "I want coffee and bikes",
    ];

    for (const query of questions) {
      expect(isNaturalLanguageRequest(query)).toBe(true);
      expect(
        unifiedRequestDestination({
          query,
          bestHref: "/places/unrelated-text-match",
          status: "done",
        }),
      ).toBe(`/ask?q=${encodeURIComponent(query)}`);
    }
  });

  it("lets a deterministic quick need outrank the reasoning path", () => {
    expect(
      unifiedRequestDestination({
        query: "where is the nearest trash can?",
        quickHref: "/amenities?need=trash",
        quickKey: "trash",
        bestHref: "/places/unrelated-text-match",
        status: "done",
      }),
    ).toBe("/amenities?need=trash");
  });

  it("does not discard constraints just because one craving matched", () => {
    const query = "I want coffee and bikes";
    expect(
      unifiedRequestDestination({
        query,
        quickHref: "/nearby?c=coffee",
        quickKey: "craving:coffee",
        bestHref: "/places/starbucks-frederick",
        status: "done",
      }),
    ).toBe(`/ask?q=${encodeURIComponent(query)}`);
  });

  it("uses the ranked entity instead of a broad craving route for compound lookups", () => {
    expect(isCompoundLookup("coffee and bikes")).toBe(true);
    expect(
      unifiedRequestDestination({
        query: "coffee and bikes",
        quickHref: "/nearby?c=coffee",
        quickKey: "craving:coffee",
        bestHref: "/places/gravel-and-grind-frederick",
        status: "done",
      }),
    ).toBe("/places/gravel-and-grind-frederick");
  });

  it("follows the official voter-registration answer shown above search results", () => {
    const query = "How do I register to vote?";
    const voterRegistration = searchCivicActions(query, 2)[0];

    expect(voterRegistration?.title).toMatch(/voter registration/i);
    expect(
      unifiedRequestDestination({
        query,
        officialHref: voterRegistration?.href,
        bestHref: "/places/unrelated-text-match",
        status: "done",
      }),
    ).toBe(voterRegistration?.href);
  });

  it("only lets safe official links participate in Enter routing", () => {
    expect(safeOfficialAnswerHref("javascript:alert(1)")).toBeNull();
    expect(safeOfficialAnswerHref("http://example.com/not-secure")).toBeNull();
    expect(
      firstSafeOfficialAnswerHref(
        "javascript:alert(1)",
        "https://www.frederickcountymd.gov/",
      ),
    ).toBe("https://www.frederickcountymd.gov/");

    const query = "How do I register to vote?";
    expect(
      unifiedRequestDestination({
        query,
        officialHref: "javascript:alert(1)",
        status: "done",
      }),
    ).toBe(`/ask?q=${encodeURIComponent(query)}`);
  });
});

describe("global search responsive chrome", () => {
  it("keeps desktop keyboard hints out of phone-width layouts", () => {
    const source = readFileSync(
      "src/components/search/SearchOverlay.tsx",
      "utf8",
    );

    expect(source).toContain(
      "[@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:flex",
    );
  });

  it("labels the bounded result window without claiming it is a total", () => {
    const source = readFileSync(
      "src/components/search/SearchOverlay.tsx",
      "utf8",
    );

    expect(source).toContain("`${results.length} shown`");
    expect(source).not.toContain(
      "`${results.length} match${results.length === 1 ? \"\" : \"es\"}`",
    );
  });

  it("does not make people choose a separate Ask Radius action", () => {
    const source = readFileSync(
      "src/components/search/SearchOverlay.tsx",
      "utf8",
    );

    expect(source).not.toContain("Ask Radius instead");
    expect(source).not.toContain(">Ask Radius<");
  });

  it("does not present a partial craving match as a direct answer to a question", () => {
    const source = readFileSync(
      "src/components/search/SearchOverlay.tsx",
      "utf8",
    );

    expect(source).toContain("visibleQuickAnswers");
    expect(source).toContain(
      "DIRECT_NATURAL_LANGUAGE_INTENTS.has(answer.key)",
    );
    expect(source).toContain('status === "done" && !reasoningRequest');
  });

  it("uses the same safe official-link action for pointer and Enter", () => {
    const source = readFileSync(
      "src/components/search/SearchOverlay.tsx",
      "utf8",
    );

    expect(source).toContain("officialHref: officialAnswerHref");
    expect(source).toContain("openOfficialAnswer(destination)");
    expect(source).toContain("openOfficialAnswer(website)");
    expect(source).toContain("openOfficialAnswer(officialHref)");
  });
});


describe("Find exact place Enter destination", () => {
  it.each([
    ["Baker Park", "baker-park-frederick"],
    ["Baker Park Bandshell", "baker-park-bandshell"],
  ])("opens the same exact %s that leads the visible list", (query, slug) => {
    const { best } = splitBestMatch(qualifiedSearchIndex(query, 12, []).results);
    const quick = findQuickAnswers(query)[0];
    expect(quick).toBeUndefined();
    expect(isNaturalLanguageRequest(query)).toBe(false);
    expect(best?.id).toBe(`place:${slug}`);
    expect(unifiedRequestDestination({ query, quickHref: quick?.href, quickKey: quick?.key,
      bestHref: best?.href, status: "done" })).toBe(`/places/${slug}`);
  });

  it.each(["National Museum of Civil War Medicine", "Schifferstadt Architectural Museum", "Frederick Coffee Company", "Sophie & Madigan's Playground"])("lets the complete %s name own its visible answer and Enter", (query) => {
    const { best } = splitBestMatch(qualifiedSearchIndex(query, 12, []).results);
    expect(best?.type).toBe("place");
    const visible = visibleFindQuickAnswers(query, "done", best);
    expect(visible).toEqual([]);
    expect(unifiedRequestDestination({ query, quickHref: visible[0]?.href, quickKey: visible[0]?.key,
      bestHref: best?.href, status: "done" })).toBe(best?.href);
  });

  it("does not guess a category while a new name is still loading", () => {
    const query = "National Museum of Civil War Medicine";
    const visible = visibleFindQuickAnswers(query, "loading");
    expect(visible).toEqual([]);
    expect(unifiedRequestDestination({ query, status: "loading" })).toBe(`/search?q=${encodeURIComponent(query)}`);
  });

  it("retains category discovery and immediate utility answers when no exact place owns the words", () => {
    expect(visibleFindQuickAnswers("museums", "done")[0]?.key).toBe("craving:art");
    expect(visibleFindQuickAnswers("bus", "loading")[0]?.key).toBe("transit");
    expect(visibleFindQuickAnswers("what's open now?", "done")[0]?.key).toBe("open-now");
  });
});


describe("retrieval before reasoning for simple requests", () => {
  it.each(["pizza?", "coffee?", "I need pizza", "I want coffee", "I'm looking for pizza", "I am looking for coffee", "I am looking for some ice cream?"])(
    "uses the canonical category answer for %s without a reasoning round trip", (query) => {
      expect(isNaturalLanguageRequest(query)).toBe(false);
      expect(exactQuestionLookupQuery(query)).toBeNull();
      const quick = visibleFindQuickAnswers(query, "done")[0];
      expect(quick?.key).toMatch(/^craving:/);
      expect(unifiedRequestDestination({ query, quickHref: quick?.href, quickKey: quick?.key,
        status: "done" })).toBe(quick?.href);
    },
  );

  it.each([
    ["museums?", "museums", "Bjorlee Museum"],
    ["I'm looking for a museum", "museum", "Bjorlee Museum"],
    ["I need tacos", "tacos", "Big Papi's Real Good Tacos"],
    ["I need sushi", "sushi", "Sushi Nomu"],
    ["I need a bed and breakfast", "bed and breakfast", "Hollerstown Hill Bed and Breakfast"],
  ])("keeps %s on its actual subtype matches instead of a wider directory", (query, lookup, firstName) => {
    const results = qualifiedSearchIndex(lookup, 12, []).results;
    expect(results[0]?.title).toBe(firstName);
    expect(visibleFindQuickAnswers(query, "done", results[0])).toEqual([]);
    expect(unifiedRequestDestination({ query, bestHref: results[0]?.href, bestResult: results[0], status: "done" }))
      .toBe(results[0]?.href);
    expect(unifiedRequestDestination({ query, status: "done" })).toBe(`/ask?q=${encodeURIComponent(query)}`);
  });

  it.each(["I need gelato", "I need a cidery", "I need a meadery", "I want wine trail", "I need espresso"])(
    "does not replace the subtype in %s with a wider directory", query => {
      expect(visibleFindQuickAnswers(query, "done").filter(answer => answer.key.startsWith("craving:"))).toEqual([]);
    },
  );

  it("keeps an unverified facility feature as the complete question", () => {
    const query = "I need sauna";
    expect(isNaturalLanguageRequest(query)).toBe(true);
    expect(unifiedRequestDestination({ query, bestHref: "/places/odin-crossfit", status: "done" }))
      .toBe(`/ask?q=${encodeURIComponent(query)}`);
  });

  it("retrieves the canonical business behind question punctuation without accepting partial matches", () => {
    const query = "Gravel & Grind?";
    const lookup = exactQuestionLookupQuery(query);
    expect(lookup).toBe("Gravel & Grind");
    const best = qualifiedSearchIndex(lookup!, 12, []).results[0];
    expect(best?.type).toBe("place");
    expect(isExactQuestionPlaceResult(query, best)).toBe(true);
    expect(visibleFindQuickAnswers(query, "done", best)).toEqual([]);
    expect(unifiedRequestDestination({ query, bestHref: best?.href, bestResult: best,
      status: "done" })).toBe(best?.href);
    expect(isExactQuestionPlaceResult("Gravel?", best)).toBe(false);
    expect(unifiedRequestDestination({ query: "Gravel?", bestHref: best?.href, bestResult: best,
      status: "done" })).toBe("/ask?q=Gravel%3F");
  });

  it.each(["idle", "loading", "error"] as const)("keeps %s Enter on full Search until exact retrieval settles", status => {
    const query = "Gravel & Grind?";
    const stale = qualifiedSearchIndex("Baker Park", 12, []).results[0];
    expect(unifiedRequestDestination({ query, bestHref: stale?.href, bestResult: stale, status }))
      .toBe(`/search?q=${encodeURIComponent(query)}`);
  });

  it.each([
    "I want coffee and bikes", "I need coffee open tonight", "I need wheelchair accessible coffee",
    "I want a quiet museum", "I need pizza without cheese", "I need food within 10 minutes",
    "I want happy hour", "I need overnight", "Where should I get breakfast?", "Plan a coffee and lunch outing",
  ])("keeps all constraints in the original reasoning request: %s", query => {
    expect(isNaturalLanguageRequest(query)).toBe(true);
    expect(unifiedRequestDestination({ query, quickHref: "/nearby?c=coffee", quickKey: "craving:coffee",
      bestHref: "/places/unrelated", status: "done" })).toBe(`/ask?q=${encodeURIComponent(query)}`);
  });

  it("keeps compound retrieval and immediate utilities on their established routes", () => {
    expect(unifiedRequestDestination({ query: "coffee and bikes", quickHref: "/nearby?c=coffee",
      quickKey: "craving:coffee", bestHref: "/places/gravel-and-grind-frederick", status: "done" }))
      .toBe("/places/gravel-and-grind-frederick");
    expect(unifiedRequestDestination({ query: "where is the nearest trash can?", quickHref: "/amenities?need=trash",
      quickKey: "trash", status: "loading" })).toBe("/amenities?need=trash");
  });
});
