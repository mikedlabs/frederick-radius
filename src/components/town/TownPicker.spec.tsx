import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MUNICIPALITIES } from "@/data/municipalities";
import { TOWN_PHOTOS } from "@/lib/integrations/wikimedia";
import type { TownStat } from "@/lib/guided/town-stats";
import { EMPTY_LINE_FC } from "@/components/map/types";
import { townOverview } from "@/app/(app)/towns/townOverview";
import TownPicker, { townCardLine } from "./TownPicker";

const STATS: TownStat[] = MUNICIPALITIES.map((m, i) => ({
  slug: m.slug,
  name: m.name,
  fact: m.fact,
  placeCount: 100 - i,
  eventCount: i % 3,
  bestFor: ["Food"],
}));

function render() {
  const overview = townOverview(EMPTY_LINE_FC);
  return renderToStaticMarkup(
    createElement(TownPicker, {
      stats: STATS,
      locators: overview.locators,
      tileOutline: overview.tileOutline,
    }),
  );
}

function card(html: string, slug: string): string {
  const start = html.indexOf(`data-town-card="${slug}"`);
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf("</li>", start);
  return html.slice(start, end);
}

describe("townCardLine", () => {
  it("is one short line of real counts", () => {
    expect(townCardLine({ placeCount: 142, eventCount: 12 })).toBe("142 places · 12 events");
    expect(townCardLine({ placeCount: 1, eventCount: 1 })).toBe("1 place · 1 event");
    expect(townCardLine({ placeCount: 6, eventCount: 0 })).toBe("6 places");
  });
});

describe("TownPicker", () => {
  const photoTowns = Object.keys(TOWN_PHOTOS);
  const tileTowns = MUNICIPALITIES.map((m) => m.slug).filter((s) => !photoTowns.includes(s));

  it("has the seven verified town photos and six towns without one", () => {
    expect(photoTowns).toHaveLength(7);
    expect(tileTowns).toHaveLength(6);
  });

  it("gives each photo town its own photo and never a neighbor's", () => {
    const html = render();
    for (const slug of photoTowns) {
      const own = card(html, slug);
      const file = encodeURIComponent(encodeURIComponent(TOWN_PHOTOS[slug].file));
      expect(own).toContain("<img");
      expect(own).toContain(file);
      for (const other of photoTowns.filter((s) => s !== slug)) {
        expect(own).not.toContain(encodeURIComponent(encodeURIComponent(TOWN_PHOTOS[other].file)));
      }
    }
  });

  it("credits a photo only after it has loaded", () => {
    const html = render();
    expect(html).not.toContain("data-town-photo-credit");
    expect(html).not.toContain("CC BY");
  });

  it("draws the other six towns on the county map instead of a photo", () => {
    const html = render();
    for (const slug of tileTowns) {
      const own = card(html, slug);
      expect(own).not.toContain("<img");
      expect(own).toContain("data-town-tile");
      expect(own).toContain("fill-[color:var(--app-brand)]");
    }
  });

  it("cuts each card to the name and one short line, with no fact sentence or tag chips", () => {
    const html = render();
    for (const t of STATS) {
      const own = card(html, t.slug);
      expect(own).toContain(`href="/m/${t.slug}"`);
      expect(own).toContain(townCardLine(t));
      expect(own).not.toContain(t.fact);
      expect(own).not.toContain("Next 7 days");
    }
    expect(html).not.toContain(">Food<");
  });
});
