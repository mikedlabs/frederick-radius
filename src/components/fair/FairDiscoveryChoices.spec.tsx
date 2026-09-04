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

  it("shows a fixed two-by-two task portal with one timely item instead of counts", () => {
    const html = renderToStaticMarkup(
      <FairDiscoveryChoices
        items={fridayItems}
        asOf="2026-09-18T20:59:00Z"
        selected={null}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("Kid Zone");
    expect(html).toContain("Animals");
    expect(html).toContain("Rides");
    expect(html).toContain("Food program");
    expect(html).not.toContain("No food or drink event listed");
    expect(html).not.toMatch(/listing/i);
    expect(html).toContain('aria-label="Fair activity paths"');
    expect(html).toContain("data-fair-discovery-choices");
    expect(html).toContain("data-fair-discovery-grid");
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("min-h-[88px]");
    expect(html).toContain("sm:min-h-[124px]");
    expect(html).toContain("text-[11px]");
    expect(html).toContain("text-[12px]");
    expect(html).toContain("sr-only break-words");
    expect(html).toContain("sm:not-sr-only");
    expect(html).not.toContain("What sounds good?");
    expect(html).not.toContain("snap-mandatory");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toMatch(/\d+ options?/);
    expect(html).toContain("Happening now");
    expect(html).toContain("4 p.m.–9 p.m.");
    expect(html).toContain("Next");
    expect(html).toContain("6 p.m.");
    expect(html).toContain("Horse Barrel Racing Expo");
    expect(html).toContain(
      "Homegrown Wineries, Breweries and Distilleries Showcase",
    );
    expect(html).toContain("fairgrounds-ferris-wheel-mike-d-960.jpg");
    expect(html).not.toContain("Photo: Mike D");
    expect(html).not.toContain(
      'data-fair-discovery-choice="food-program" disabled=""',
    );
  });

  it("turns a choice on only when the selected day has reviewed matching data", () => {
    const sundayItems = data.scheduleItems.filter(
      (item) => item.date === "2026-09-20",
    );
    const html = renderToStaticMarkup(
      <FairDiscoveryChoices
        items={sundayItems}
        asOf="2026-09-18T20:59:00Z"
        selected="food-program"
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("Next");
    expect(html).toContain("Noon–10 p.m.");
    expect(html).toContain(
      "Homegrown Wineries, Breweries and Distilleries Showcase",
    );
    expect(html).toContain(
      'data-fair-discovery-choice="food-program" aria-pressed="true"',
    );
    expect(html).not.toContain(
      'data-fair-discovery-choice="food-program" disabled=""',
    );
  });
});
