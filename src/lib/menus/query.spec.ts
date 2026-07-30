import { describe, expect, it } from "vitest";
import {
  isUsefulNativeMenuMatch,
  nativeMenuQueryEvidence,
  nativeMenuQueryTerms,
  shouldAnswerFromNativeMenu,
} from "./query";

describe("native menu query evidence", () => {
  it("keeps the dish terms and drops conversational filler", () => {
    expect(nativeMenuQueryTerms("Where can I get birria tacos tonight?")).toEqual([
      "birria",
      "taco",
    ]);
  });

  it("accepts a complete multi-word dish match", () => {
    expect(
      shouldAnswerFromNativeMenu("birria tacos", {
        itemName: "Birria Tacos",
        sectionName: "Tacos",
      }),
    ).toBe(true);
  });

  it("accepts an explicit single-item menu request", () => {
    expect(
      shouldAnswerFromNativeMenu("Who has ramen on the menu?", {
        itemName: "Ramen",
      }),
    ).toBe(true);
  });

  it("does not let a partial menu match hijack a compound place request", () => {
    const candidate = {
      itemName: "Coffee",
      sectionName: "Drinks",
    };
    expect(nativeMenuQueryEvidence("coffee and bikes", candidate)).toMatchObject({
      terms: ["coffee", "bike"],
      matchedTerms: ["coffee"],
      coverage: 0.5,
    });
    expect(shouldAnswerFromNativeMenu("coffee and bikes", candidate)).toBe(false);
  });

  it("does not replace Ask for a broad single-word discovery query", () => {
    expect(
      shouldAnswerFromNativeMenu("coffee", {
        itemName: "Coffee",
      }),
    ).toBe(false);
  });

  it("can still annotate a partial Search result without calling it the answer", () => {
    expect(
      isUsefulNativeMenuMatch("coffee and bikes", {
        itemName: "Coffee",
      }),
    ).toBe(true);
  });

  it("does not infer dietary evidence that is absent from the record", () => {
    expect(
      shouldAnswerFromNativeMenu("gluten free pizza", {
        itemName: "Cheese Pizza",
        dietaryLabels: [],
      }),
    ).toBe(false);
  });
});
