import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";

import FairDiscoveryChoices, {
  fairDiscoveryIntentMatches,
} from "./FairDiscoveryChoices";
import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";

const data = buildFairDayWorkspaceData(
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
  new Date("2026-09-18T20:59:00Z"),
);
const fridayItems = data.scheduleItems.filter(
  (item) => item.date === "2026-09-18",
);

describe("FairDiscoveryChoices", () => {
  it("uses only the reviewed program predicates for visitor intents", () => {
    const agriculture = fridayItems.find((item) => item.kind === "agriculture");
    const animal = fridayItems.find((item) => item.kind === "animal");
    const carnival = fridayItems.find((item) => item.kind === "carnival");
    const kidZone = fridayItems.find((item) =>
      /kid zone/i.test(`${item.title} ${item.detail ?? ""}`),
    );

    expect(agriculture).toBeDefined();
    expect(animal).toBeDefined();
    expect(carnival).toBeDefined();
    expect(kidZone).toBeDefined();
    expect(fairDiscoveryIntentMatches(agriculture!, "animals")).toBe(false);
    expect(fairDiscoveryIntentMatches(animal!, "animals")).toBe(true);
    expect(fairDiscoveryIntentMatches(carnival!, "carnival")).toBe(true);
    expect(fairDiscoveryIntentMatches(kidZone!, "kid-zone")).toBe(true);
  });

  it("shows a compact, day-specific path rail without dead choices or directory copy", () => {
    const html = renderToStaticMarkup(
      <FairDiscoveryChoices
        items={fridayItems}
        selected={null}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("Kid Zone");
    expect(html).toContain("Free fun for all ages");
    expect(html).toContain("Animals &amp; livestock");
    expect(html).toContain("Carnival &amp; rides");
    expect(html).not.toContain("Food-related program");
    expect(html).not.toMatch(/listing/i);
    expect(html).toContain("snap-mandatory");
    expect(html).toContain("1 option");
    expect(html).toContain("4 p.m. - 9 p.m. · Kid Zone");
  });
});
