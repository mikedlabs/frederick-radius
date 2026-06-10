import { describe, it, expect } from "vitest";
import { parseIntent } from "./parseIntent";

describe("parseIntent", () => {
  it("extracts a single intent token and clears it from the text", () => {
    expect(parseIntent("coffee open now")).toEqual({
      tokens: ["open-now"],
      text: "coffee",
    });
  });

  it("extracts multiple tokens in stable display order", () => {
    const r = parseIntent("free outdoors with kids this weekend");
    expect(r.tokens).toEqual(["this-weekend", "free", "with-kids", "outdoors"]);
    expect(r.text).toBe("");
  });

  it("keeps unrecognized words as the search term", () => {
    expect(parseIntent("brewer's alley")).toEqual({
      tokens: [],
      text: "brewer's alley",
    });
  });

  it("matches phrases case-insensitively and across extra spaces", () => {
    expect(parseIntent("Tonight   NEAR  ME").tokens).toEqual([
      "tonight",
      "near-me",
    ]);
  });

  it("leaves a real query that merely contains a token-ish substring", () => {
    // "freedom" must NOT trigger the "free" token (\b word boundary).
    expect(parseIntent("freedom plaza")).toEqual({
      tokens: [],
      text: "freedom plaza",
    });
  });

  it("handles empty / whitespace input", () => {
    expect(parseIntent("")).toEqual({ tokens: [], text: "" });
    expect(parseIntent("   ")).toEqual({ tokens: [], text: "" });
  });
});
