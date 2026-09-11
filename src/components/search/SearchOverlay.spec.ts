import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  firstSafeOfficialAnswerHref,
  isCompoundLookup,
  isNaturalLanguageRequest,
  safeOfficialAnswerHref,
  unifiedRequestDestination,
} from "./SearchOverlay";
import { searchCivicActions } from "@/lib/search/civic";

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
