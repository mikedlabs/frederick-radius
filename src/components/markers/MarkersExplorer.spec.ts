import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HistoricMarker } from "@/lib/integrations/historicSites";
import MarkersExplorer from "./MarkersExplorer";

function marker(index: number): HistoricMarker {
  return {
    id: `marker-${index}`,
    title: `Marker ${index}`,
    town: "Frederick",
    municipality: "frederick",
    inscription: `History for marker ${index}.`,
    lng: -77.41 + index * 0.001,
    lat: 39.41 + index * 0.001,
  };
}

describe("MarkersExplorer", () => {
  it("starts with a short field-guide selection and names each map action", () => {
    const html = renderToStaticMarkup(
      createElement(MarkersExplorer, { markers: Array.from({ length: 10 }, (_, index) => marker(index + 1)) }),
    );

    expect(html).toContain("Show 2 more markers");
    expect(html).toContain('aria-label="Find Marker 1 on the map"');
    expect(html).not.toContain('aria-label="Find Marker 9 on the map"');
  });
});
