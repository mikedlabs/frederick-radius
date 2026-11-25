import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RODDY_ROAD_ARCHIVE_PHOTO as bridge } from "@/data/roddy-road-archive-photo";
import MarkersPage from "./page";

vi.mock("@/lib/integrations/historicSites", () => ({
  getHistoricMarkersResult: async () => ({ items: [], ok: true }),
  getRegisterSitesResult: async () => ({ items: [], ok: true }),
}));

it("renders the bundled Roddy Road portrait with the original archive credit and date range", async () => {
  const image = readFileSync(path.join(process.cwd(), "public", bridge.image.src));
  expect(createHash("sha256").update(image).digest("hex")).toBe(bridge.review.sha256);
  const html = renderToStaticMarkup(await MarkersPage());
  expect(html).toContain(encodeURIComponent(bridge.image.src));
  expect(html).toContain(bridge.image.alt);
  expect(html).toContain(bridge.image.source_url);
  expect(html).toContain(bridge.image.license.url);
  expect(html).toContain("Photographed between 1980 and 2006");
  expect(html).not.toContain("wikimedia.org");
});
