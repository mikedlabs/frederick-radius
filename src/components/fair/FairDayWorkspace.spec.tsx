import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";
import { setFairPlanDay, setFairPlanParty } from "@/lib/fair/plan";

import FairDayWorkspace from "./FairDayWorkspace";
import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";

const data = buildFairDayWorkspaceData(
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
  new Date("2026-09-01T20:00:00Z"),
);

describe("FairDayWorkspace server-rendered contract", () => {
  it("renders the public identity, independent-guide disclosure, and photo credit", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("Fair Day");
    expect(html).toContain("by Frederick Radius");
    expect(html).not.toContain("Fair Mode");
    expect(html).toContain(data.disclosure);
    expect(html).toContain("Photo: Mike D");
    expect(html).toContain("This image is not a current map");
    expect(html).toContain("fairgrounds-night-mike-d-960.jpg");
    expect(html).toContain("fairgrounds-night-mike-d-1920.jpg");
  });

  it("renders one workspace landmark and marks its internal action bar", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).not.toContain("<main");
    expect(html).toContain("data-mobile-action-bar=\"true\"");
    expect(html).toContain('aria-label="Fair Day sections"');
    expect(html.match(/font-editorial/g)).toHaveLength(1);
  });

  it("hands off to EventHub only as the Fair's official external guide", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("Official external EventHub guide");
    expect(html).toContain(
      "does not treat that floorplan as reviewed map geometry",
    );
    expect(html).toContain(
      'href="https://mobile.eventhub-floorplan.net/?Show_ID=18209"',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("keeps initial arrival honest and offers a low-friction ticket choice", () => {
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data }),
    );

    expect(html).toContain("Arrival option not chosen");
    expect(html).toContain("Compare ticket options");
    expect(html).toContain("Tickets are handled");
    expect(html).not.toContain('name="fair-ticket-choice"');
    expect(data.arrivalOptions.find((option) => option.planChoice === "transit")?.summary).toContain(
      "Service on Fair dates is not confirmed",
    );
    expect(data.arrivalOptions.find((option) => option.planChoice === "drive")?.summary).toContain(
      "Fair parking shuttle, not county Transit",
    );
  });

  it("shows only offers valid for the selected day and before known deadlines", () => {
    const party = {
      adults11Plus: 1,
      children10Under: 0,
      adultRiders: 0,
      childRiders: 0,
    };
    const dataWithParty = {
      ...data,
      initialPlan: setFairPlanParty(
        data.initialPlan,
        party,
        "2026-09-01T20:01:00Z",
      ),
    };
    const afterJackDeadline = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T22:00:00Z"),
    );
    const afterDeadlineWithParty = {
      ...afterJackDeadline,
      initialPlan: setFairPlanParty(
        afterJackDeadline.initialPlan,
        party,
        "2026-09-18T22:00:01Z",
      ),
    };
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data: dataWithParty }),
    );
    const deadlineHtml = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data: afterDeadlineWithParty }),
    );

    expect(html).not.toContain("$60 Carload Special");
    expect(html).toContain("$35 Jack Pass");
    expect(deadlineHtml).not.toContain("$35 Jack Pass");
  });

  it("does not silently limit a selected day to twelve program rows", () => {
    const rowsByDate = new Map<string, number>();
    for (const item of data.scheduleItems) {
      rowsByDate.set(item.date, (rowsByDate.get(item.date) ?? 0) + 1);
    }
    const [largestDate, largestCount] = [...rowsByDate.entries()].sort(
      (left, right) => right[1] - left[1],
    )[0];
    const selectedData = {
      ...data,
      initialDate: largestDate,
      initialPlan: {
        ...data.initialPlan,
        selectedDayId: `day-${largestDate}`,
      },
    };
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, { data: selectedData }),
    );
    const addLabels = html.match(/aria-label="Add [^"]+ to My Fair Day"/g) ?? [];

    expect(largestCount).toBeGreaterThan(12);
    expect(addLabels).toHaveLength(largestCount);
    expect(html).toContain("Read the official program wording");
  });

  it("renders a complete party subtotal without comparing eligibility promotions", () => {
    const selectedDayPlan = setFairPlanDay(
      data.initialPlan,
      "day-2026-09-21",
      "2026-09-01T20:01:00Z",
    );
    const partyPlan = setFairPlanParty(
      selectedDayPlan,
      {
        adults11Plus: 2,
        children10Under: 2,
        adultRiders: 1,
        childRiders: 1,
      },
      "2026-09-01T20:02:00Z",
    );
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, {
        data: { ...data, initialDate: "2026-09-21", initialPlan: partyPlan },
      }),
    );

    expect(html).toContain("Adults 11+");
    expect(html).toContain("Children 10 and under");
    expect(html).toContain("Adult riders");
    expect(html).toContain("Child riders");
    expect(html).toContain("Lowest reviewed listed subtotal");
    expect(html).toContain("$80");
    expect(html).toContain("1 × Adult admission online");
    expect(html).toContain("2 × $35 Jack Pass");
    expect(html).toContain("Eligibility promotions");
    expect(html).not.toMatch(/cheapest|best deal|save \$/i);
  });

  it("uses the valid opening-Friday online admission tier from the released pack", () => {
    const partyPlan = setFairPlanParty(
      data.initialPlan,
      {
        adults11Plus: 2,
        children10Under: 0,
        adultRiders: 0,
        childRiders: 0,
      },
      "2026-09-01T20:02:00Z",
    );
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, {
        data: { ...data, initialPlan: partyPlan },
      }),
    );

    expect(html).toContain("$16");
    expect(html).toContain("2 × First Friday advance admission");
  });

  it("shows the Tuesday Carload conditions beside its reviewed subtotal", () => {
    const selectedDayPlan = setFairPlanDay(
      data.initialPlan,
      "day-2026-09-22",
      "2026-09-01T20:01:00Z",
    );
    const partyPlan = setFairPlanParty(
      selectedDayPlan,
      {
        adults11Plus: 2,
        children10Under: 0,
        adultRiders: 2,
        childRiders: 0,
      },
      "2026-09-01T20:02:00Z",
    );
    const html = renderToStaticMarkup(
      createElement(FairDayWorkspace, {
        data: { ...data, initialDate: "2026-09-22", initialPlan: partyPlan },
      }),
    );

    expect(html).toContain("$60");
    expect(html).toContain("Conditional lowest reviewed listed subtotal");
    expect(html).toContain("one vehicle");
    expect(html).toContain("Lot D");
    expect(html).toContain("Official checkout controls the final price and availability");
  });
});
