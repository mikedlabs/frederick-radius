import { Children, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MUNICIPALITIES } from "@/data/municipalities";
import { getTownPhoto } from "@/lib/integrations/wikimedia";
import MunicipalityPage from "./page";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/loaders/townEventPreview", () => ({
  getTownEventPreview: async () => ({ local: [], nearby: null, degraded: false }),
}));
vi.mock("@/lib/loaders/places", () => ({ publicPlacesByMunicipality: () => [] }));

describe("town detail photography", () => {
  it.each(MUNICIPALITIES)("shows a photograph only when the source identifies $name", async (town) => {
    const page = await MunicipalityPage({ params: Promise.resolve({ municipality: town.slug }) });
    const header = Children.toArray(page.props.children).find(
      (child): child is ReactElement => isValidElement(child) && child.type === "header",
    );
    expect(header).toBeDefined();
    const html = renderToStaticMarkup(header);
    expect(html).toContain(town.name);
    expect(html).not.toContain("/images/seasons/");
    const photo = getTownPhoto(town.slug);
    if (photo) {
      expect(html).toContain("<img");
      expect(html).toContain(photo.source_url);
      expect(html).toContain(photo.capturedOn!.slice(0, 4));
      expect(html).toContain("data-town-photo-credit");
    } else {
      expect(html).not.toContain("<figure");
      expect(html).not.toContain("<img");
    }
  });
});
