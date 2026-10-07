import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const query = vi.hoisted(() => ({ scope: "county" as string | null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query.scope ? { in: query.scope } : {}),
}));

import TodayPlanTonightLink, { showsPlanTonight, tonightEntryHref } from "./TodayPlanTonightLink";

// 2 PM and 10:53 PM Eastern on Oct 6, 2026.
const AFTERNOON = "2026-10-06T18:00:00.000Z";
const LATE = "2026-10-07T02:53:00.000Z";

describe("Today entry into Tonight", () => {
  beforeEach(() => { query.scope = "county"; });

  it("keeps explicit county over a previously saved Brunswick lens", () => {
    expect(tonightEntryHref("county", "town:brunswick"))
      .toBe("/today/tonight?intent=dinner&in=county");
    expect(renderToStaticMarkup(<TodayPlanTonightLink renderedAt={AFTERNOON} />))
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

  it("retires after 9 PM, when Today's program and tomorrow carry the answer", () => {
    expect(showsPlanTonight(new Date("2026-10-07T00:59:00.000Z"))).toBe(true); // 8:59 PM
    expect(showsPlanTonight(new Date("2026-10-07T01:00:00.000Z"))).toBe(false); // 9:00 PM
    expect(showsPlanTonight(new Date("2026-10-07T05:00:00.000Z"))).toBe(false); // 1:00 AM
    expect(showsPlanTonight(new Date("2026-10-07T09:00:00.000Z"))).toBe(true); // 5:00 AM
    // The server snapshot follows the render instant, so a cached late page
    // hydrates without the link instead of flashing it.
    expect(renderToStaticMarkup(<TodayPlanTonightLink renderedAt={LATE} />)).toBe("");
  });
});
