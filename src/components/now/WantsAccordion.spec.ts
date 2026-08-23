// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  categoryKeyForWant,
  restoreWantAnswerFocus,
  wantAnswerFocusTarget,
} from "./WantsAccordion";

afterEach(() => {
  document.body.replaceChildren();
});

describe("WantsAccordion restored answer context", () => {
  it("opens the category that owns a restored nearby or category answer", () => {
    expect(categoryKeyForWant("coffee")).toBe("eat");
    expect(categoryKeyForWant("drinks")).toBe("drink");
    expect(categoryKeyForWant("movies")).toBe("seedo");
    expect(categoryKeyForWant("cat:distillery")).toBe("drink");
  });

  it("recognizes the injected time-aware meal answer", () => {
    expect(categoryKeyForWant("breakfast", "breakfast")).toBe("eat");
    expect(categoryKeyForWant("not-a-real-want", "breakfast")).toBeNull();
  });

  it("keeps the exact opener for a normally tapped answer", () => {
    const root = document.createElement("div");
    const opener = document.createElement("a");
    const matchingUrlTrigger = document.createElement("a");
    matchingUrlTrigger.dataset.wantAnswerTrigger = "";
    matchingUrlTrigger.dataset.wantKey = "coffee";
    root.append(opener, matchingUrlTrigger);
    document.body.append(root);

    expect(
      wantAnswerFocusTarget(opener, root, { c: "coffee", facet: null }),
    ).toBe(opener);
  });

  it("restores a shared URL answer to its matching choice without an opener", async () => {
    const root = document.createElement("div");
    const category = document.createElement("button");
    category.dataset.wantCategoryTrigger = "";
    category.setAttribute("aria-pressed", "true");
    const coffee = document.createElement("a");
    coffee.href = "/nearby?c=coffee";
    coffee.dataset.wantAnswerTrigger = "";
    coffee.dataset.wantKey = "coffee";
    root.append(category, coffee);
    document.body.append(root);

    restoreWantAnswerFocus(null, root, { c: "coffee", facet: null });
    await Promise.resolve();

    expect(document.activeElement).toBe(coffee);
  });

  it("falls back to the active category for an unknown restored answer", async () => {
    const root = document.createElement("div");
    const category = document.createElement("button");
    category.dataset.wantCategoryTrigger = "";
    category.setAttribute("aria-pressed", "true");
    root.append(category);
    document.body.append(root);

    restoreWantAnswerFocus(null, root, { c: "unknown", facet: null });
    await Promise.resolve();

    expect(document.activeElement).toBe(category);
  });
});
