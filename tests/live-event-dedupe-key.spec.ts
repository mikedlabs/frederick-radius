import { describe, it, expect } from "vitest";
import { liveEventDedupeKey } from "@/lib/integrations/ical-live";

/**
 * PR3 — cross-feed event dedupe. A feed lists the same event both bare and
 * org-prefixed; the dedupe key must key on the NORMALIZED title (org prefix
 * stripped + case-folded, the same transform the card displays) so the
 * variants collapse to one row on every surface.
 */
describe("liveEventDedupeKey — collapses org-prefixed / cased variants", () => {
  const start = new Date("2026-06-16T23:00:00Z");
  const venue = "Carroll Creek Park";

  it("the real county-feed duplicate collapses to one key", () => {
    const bare = liveEventDedupeKey("Asia On The Creek", start, venue);
    const orgPrefixed = liveEventDedupeKey(
      "Asian American Center of Frederick-Asia on the Creek",
      start,
      venue,
    );
    expect(orgPrefixed).toBe(bare);
  });

  it("a pure casing difference collapses", () => {
    expect(liveEventDedupeKey("First Saturday", start, venue)).toBe(
      liveEventDedupeKey("FIRST SATURDAY", start, venue),
    );
  });

  it("genuinely different events keep distinct keys", () => {
    const a = liveEventDedupeKey("Asia On The Creek", start, venue);
    const b = liveEventDedupeKey("Oktoberfest", start, venue);
    expect(a).not.toBe(b);
  });

  it("same title at a different time stays distinct (not over-merged)", () => {
    const noon = liveEventDedupeKey("Asia On The Creek", new Date("2026-06-16T16:00:00Z"), venue);
    const evening = liveEventDedupeKey("Asia On The Creek", new Date("2026-06-16T23:00:00Z"), venue);
    expect(noon).not.toBe(evening);
  });
});
