import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const query = vi.hoisted(() => ({ scope: "county" as string | null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query.scope ? { in: query.scope } : {}),
}));

import TodayPlanTonightLink, { tonightEntryHref } from "./TodayPlanTonightLink";

describe("Today entry into Tonight", () => {
  beforeEach(() => { query.scope = "county"; });

  it("keeps explicit county over a previously saved Brunswick lens", () => {
    expect(tonightEntryHref("county", "town:brunswick"))
      .toBe("/today/tonight?intent=dinner&in=county");
    expect(renderToStaticMarkup(<TodayPlanTonightLink />))
      .toContain('href="/today/tonight?intent=dinner&amp;in=county"');
  });

  it("carries explicit towns and Near me instead of reviving another saved area", () => {
    expect(tonightEntryHref("rosemont", "town:brunswick"))
      .toBe("/today/tonight?intent=dinner&in=rosemont");
    expect(tonightEntryHref("nearme", "town:brunswick"))
      .toBe("/today/tonight?intent=dinner&in=nearme");
  });

  it("retains a saved scope when the current URL does not specify one", () => {
    expect(tonightEntryHref(null, "town:brunswick"))
      .toBe("/today/tonight?intent=dinner&in=brunswick");
    expect(tonightEntryHref("invalid-town", "county"))
      .toBe("/today/tonight?intent=dinner&in=county");
  });

  it("lets the Tonight server validate its cookie when no client scope is known", () => {
    expect(tonightEntryHref(null, null)).toBe("/tonight");
  });
});
