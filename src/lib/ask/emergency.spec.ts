import { describe, expect, it } from "vitest";
import { emergencyRequestKind } from "./emergency";

describe("emergencyRequestKind", () => {
  it("keeps animal poison requests on veterinary help", () => {
    expect(emergencyRequestKind("My dog ate chocolate. Where is an emergency vet?")).toBe("pet");
  });

  it("distinguishes human poison, ER, and urgent-care requests", () => {
    expect(emergencyRequestKind("Who do I call for a possible poisoning?")).toBe("human-poison");
    expect(emergencyRequestKind("Where is the nearest ER?")).toBe("human-emergency");
    expect(emergencyRequestKind("Find urgent care near me")).toBe("urgent-care");
  });

  it("does not treat ordinary vet or hospital discovery as an emergency", () => {
    expect(emergencyRequestKind("Find a vet for annual shots")).toBeNull();
    expect(emergencyRequestKind("Who has brunch near the hospital?")).toBeNull();
  });
});
