import { describe, expect, it } from "vitest";
import { getIntentByKey, INTENT_BY_KEY, type IntentMatchable } from "@/data/intents";

const park = (
  overrides: Partial<IntentMatchable> = {},
): IntentMatchable => ({
  slug: "test-park",
  name: "Test Park",
  category: "park",
  subcategories: [],
  short_blurb: "A public park.",
  ...overrides,
});

describe("intent URL lookup", () => {
  it("accepts only own intent keys, never inherited object properties", () => {
    expect(getIntentByKey("coffee")).toBe(INTENT_BY_KEY.coffee);
    expect(getIntentByKey("constructor")).toBeNull();
    expect(getIntentByKey("__proto__")).toBeNull();
    expect(getIntentByKey("toString")).toBeNull();
    expect(Object.getPrototypeOf(INTENT_BY_KEY)).toBeNull();
  });
});

describe("outdoor playground intent", () => {
  const playground = INTENT_BY_KEY.outdoor.subIntents?.find(
    (intent) => intent.key === "playgrounds",
  );

  it("includes a parent park when its source-backed blurb names a playground", () => {
    expect(playground).toBeDefined();
    expect(playground!.match(park({
      name: "Pinecliff Park",
      short_blurb: "Green space with ball fields, a playground, and picnic areas.",
    }))).toBe(true);
  });

  it("does not turn every generic park into a playground", () => {
    expect(playground).toBeDefined();
    expect(playground!.match(park())).toBe(false);
  });
});

describe("auto-care discovery intent", () => {
  const autoCare = INTENT_BY_KEY.civic.subIntents?.find(
    (intent) => intent.key === "auto-care",
  );

  it("keeps auto care inside the practical-services map path", () => {
    const lubeCenter: IntentMatchable = {
      slug: "route-85-lube-center-frederick",
      name: "Route 85 Lube Center",
      category: "auto-care",
      subcategories: ["oil-change"],
      short_blurb: "Drive-through oil changes and preventive maintenance.",
    };

    expect(INTENT_BY_KEY.civic.match(lubeCenter)).toBe(true);
    expect(autoCare).toBeDefined();
    expect(autoCare!.match(lubeCenter)).toBe(true);
  });
});
