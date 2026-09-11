import { describe, expect, it } from "vitest";
import { cleanBlurbFragment, formatAddress } from "./text";

// The three real fragment classes the 2026-07 UX audit found in the DFP
// blurbs (QW-14) — each case below is a shipped offender, verbatim.
describe("cleanBlurbFragment", () => {
  it("restores a name-stripped copula fragment", () => {
    expect(
      cleanBlurbFragment("is a family-owned and operated poly furniture & design boutique"),
    ).toBe("A family-owned and operated poly furniture & design boutique");
  });

  it("strips domain-tail + phone debris before the real sentence", () => {
    expect(
      cleanBlurbFragment("com 301-266- Peaceful Massage Studio in the heart of Downtown Frederick"),
    ).toBe("Peaceful Massage Studio in the heart of Downtown Frederick");
  });

  it("sentence-cases a lowercase template fragment", () => {
    expect(cleanBlurbFragment("museum in downtown Frederick.")).toBe(
      "Museum in downtown Frederick.",
    );
  });

  it("is a no-op on clean sentences", () => {
    const s = "Thurmont fixture since 1929. Every president since FDR has eaten here.";
    expect(cleanBlurbFragment(s)).toBe(s);
    // "Is" as a real sentence opener (rare but legal) is left alone…
    // (starts uppercase, so no rule fires)
    expect(cleanBlurbFragment("Island vibes on Market Street.")).toBe(
      "Island vibes on Market Street.",
    );
  });
});

describe("formatAddress", () => {
  it("repairs a civic room identifier concatenated into the locality", () => {
    expect(
      formatAddress("140 W Patrick Street Conference Room CFrederick"),
    ).toBe("140 W Patrick Street, Conference Room C, Frederick");
    expect(formatAddress("12 E Church St.Frederick, MD21701")).toBe(
      "12 E Church St., Frederick, MD 21701",
    );
  });

  it("does not split an ordinary venue phrase", () => {
    expect(formatAddress("Market Street Stage")).toBe("Market Street Stage");
  });
});
