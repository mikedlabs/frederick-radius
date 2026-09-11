import { describe, expect, it } from "vitest";
import { safeAskDescription } from "./source-copy";

describe("safeAskDescription", () => {
  it("rejects scraped contact and marketing copy", () => {
    expect(safeAskDescription(
      "Example Cafe",
      "Visit us at 12 Main Street or call us at 301-555-1212 for an amazing experience.",
    )).toBeUndefined();
  });

  it("keeps restrained editorial prose", () => {
    expect(safeAskDescription(
      "Example Cafe",
      "A compact counter-service cafe focused on breakfast sandwiches and coffee.",
    )).toContain("breakfast sandwiches");
  });
});
