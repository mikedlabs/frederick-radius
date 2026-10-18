import { describe, expect, it } from "vitest";
import { eventDisplayTitle } from "./display-title";

describe("event source identity in compact display", () => {
  it("preserves a supplied presenter and production wording without changing canonical fields", () => {
    const row = Object.freeze({ title: "Live Theatre Production", presenter: "Other Voices Theatre" });
    expect(eventDisplayTitle(row)).toBe("Other Voices Theatre: Live Theatre Production");
    expect(row).toEqual({ title: "Live Theatre Production", presenter: "Other Voices Theatre" });
  });
  it.each([undefined, "", "   "])("keeps the source title when no meaningful presenter is supplied", presenter => {
    expect(eventDisplayTitle({ title: "A Midsummer Night's Dream", presenter })).toBe("A Midsummer Night's Dream");
  });
  it("does not repeat an already identified presenter", () => {
    expect(eventDisplayTitle({ title: "Other Voices Theatre: A Midsummer Night's Dream", presenter: "Other Voices Theatre" })).toBe("Other Voices Theatre: A Midsummer Night's Dream");
  });
  it("matches presenter words rather than substrings inside another word", () => {
    expect(eventDisplayTitle({ title: "Party in the Park", presenter: "Art" })).toBe("Art: Party in the Park");
  });
});
