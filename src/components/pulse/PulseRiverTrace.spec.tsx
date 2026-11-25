// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PulseRiverTrace from "./PulseRiverTrace";

const end = "2026-11-24T22:00:00Z";
function chart(rows: Array<[string, number]>) {
  const node = document.createElement("div");
  node.innerHTML = renderToStaticMarkup(<PulseRiverTrace name="MONOCACY RIVER NR FREDERICK, MD" end={end}
    readings={rows.map(([at, value]) => ({ at, value }))} />);
  return node;
}
describe("County status river history", () => {
  it("uses a named gauge, an observed range, local times and gaps", () => {
    const node = chart([["2026-11-24T16:00:00Z", 3.03], ["2026-11-24T16:15:00Z", 3.04], ["2026-11-24T21:45:00Z", 3.02]]);
    expect(node.textContent).toContain("Monocacy River near Frederick · 6 hours");
    expect(node.textContent).toContain("3.02–3.04 ft observed · gaps in record");
    expect(node.textContent).toContain("4 ft3 ft");
    expect(node.textContent).toContain("11:00 AM5:00 PM ET");
    expect(node.querySelectorAll("polyline")).toHaveLength(2);
  });
  it("omits the trace if fewer than two usable samples fall within the window", () => {
    expect(chart([["2026-11-24T08:00:00Z", 3.01], ["2026-11-24T22:00:00Z", 3.03]]).innerHTML).toBe("");
  });
});
