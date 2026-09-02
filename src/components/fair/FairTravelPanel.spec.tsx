import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import FairTravelPanel from "./FairTravelPanel";
import type { FairDayArrivalView } from "./types";

const options: FairDayArrivalView[] = [
  {
    id: "arrival-drive",
    planChoice: "drive",
    label: "Drive and park",
    summary:
      "Use I-70 Exit 56. A free accessible Fair shuttle runs from Lot D to Gate 4A.",
    paymentLabel: "$15 infield or $10 in Lots A through D.",
    returnLabel: "Return to your saved parking lot",
    returnSummary: "Save the lot and entrance you used before entering.",
    officialInfoUrl: "https://example.com/fair-parking",
  },
  {
    id: "arrival-transit",
    planChoice: "transit",
    label: "County Transit",
    summary:
      "The static feed associates East Patrick Street at Fairground Center with EFS and 15.",
    paymentLabel: "County Transit is fare-free.",
    returnLabel: "Recheck County Transit before leaving",
    returnSummary: "No Fair-date arrival time is confirmed.",
    officialInfoUrl: "https://example.com/county-transit",
  },
  {
    id: "arrival-drop-off",
    planChoice: "drop-off",
    label: "Drop-off",
    summary: "The official guidance identifies Gate 4A for drop-off.",
    paymentLabel: "No parking payment applies.",
    returnLabel: "Meet your driver at Gate 4A",
    returnSummary: "Confirm the return point with your driver before entering.",
    officialInfoUrl: "https://example.com/fair-dropoff",
  },
];

function render(selected: FairDayArrivalView | null, eventPhase: "pre-fair" | "fair-day" = "pre-fair") {
  return renderToStaticMarkup(
    createElement(FairTravelPanel, {
      options,
      selected,
      eventPhase,
      onSelect: vi.fn(),
    }),
  );
}

describe("FairTravelPanel", () => {
  it("presents three mode-first choices and waits for one selection", () => {
    const html = render(null);

    expect(html).toContain("Drive / Park");
    expect(html).toContain("County Transit");
    expect(html).toContain("Drop-off");
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain("Choose a travel mode to see only the steps you need.");
    expect(html).not.toContain("Open Radius Transit");
    expect(html).not.toContain("Device-only car memory");
  });

  it("shows only the selected transit subflow and keeps its limits prominent", () => {
    const html = render(options[1]);

    expect(html).toContain("County Transit is fare-free.");
    expect(html).toContain("East Patrick Street at Fairground Center");
    expect(html).toContain(
      "Fair-date service and arrival times are not confirmed from the current Fair data pack.",
    );
    expect(html).toContain('href="/transit"');
    expect(html).toContain('href="https://example.com/county-transit"');
    expect(html).not.toContain("$15 infield");
    expect(html).not.toContain("Meet your driver at Gate 4A");
  });

  it("offers the device-only car memory only while the Fair is underway", () => {
    const beforeFair = render(options[0], "pre-fair");
    const duringFair = render(options[0], "fair-day");

    expect(beforeFair).toContain("Check official parking details");
    expect(beforeFair).not.toContain("Device-only car memory");
    expect(duringFair).toContain("Device-only car memory");
    expect(duringFair).toContain("Save my location");
    expect(duringFair).not.toContain("Check official parking details");
  });

  it("keeps the confirmed drop-off and return facts together", () => {
    const html = render(options[2]);

    expect(html).toContain("The official guidance identifies Gate 4A for drop-off.");
    expect(html).toContain("Meet your driver at Gate 4A");
    expect(html).toContain("Confirm the return point with your driver before entering.");
    expect(html).toContain("Confirm official drop-off details");
    expect(html).not.toContain("Fair-date service and arrival times are not confirmed");
  });
});
