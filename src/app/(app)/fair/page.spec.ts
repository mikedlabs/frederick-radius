import { describe, expect, it } from "vitest";

import { fairCampaignHref } from "@/lib/fair/campaign";

describe("Fair short campaign link", () => {
  it("keeps a plain spoken link short", () => {
    expect(fairCampaignHref({})).toBe(
      "/moments/great-frederick-fair-2026",
    );
  });

  it("preserves bounded campaign attribution for promotion", () => {
    expect(
      fairCampaignHref({
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "fair-day-2026",
        unrelated: "discard-me",
      }),
    ).toBe(
      "/moments/great-frederick-fair-2026?utm_source=instagram&utm_medium=social&utm_campaign=fair-day-2026",
    );
  });
});
