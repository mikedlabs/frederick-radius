// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MUNICIPALITIES } from "@/data/municipalities";
import { TOWN_PHOTOS } from "@/lib/integrations/wikimedia";
import type { TownStat } from "@/lib/guided/town-stats";
import { EMPTY_LINE_FC } from "@/components/map/types";
import { townOverview } from "@/app/(app)/towns/townOverview";
import TownPicker from "./TownPicker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const STATS: TownStat[] = MUNICIPALITIES.map((m) => ({
  slug: m.slug,
  name: m.name,
  fact: m.fact,
  placeCount: 10,
  eventCount: 0,
  bestFor: [],
}));

/** Settle a photo the way a browser would: next/image reports onLoad after
 *  decode, and a 1px image is the failure signal. */
async function settle(img: HTMLImageElement, outcome: "photo" | "signal" | "error") {
  await act(async () => {
    if (outcome === "error") {
      img.dispatchEvent(new Event("error"));
      return;
    }
    const size = outcome === "photo" ? [1200, 800] : [1, 1];
    Object.defineProperties(img, {
      naturalWidth: { configurable: true, value: size[0] },
      naturalHeight: { configurable: true, value: size[1] },
    });
    img.dispatchEvent(new Event("load"));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("TownPicker photos in the browser", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const overview = townOverview(EMPTY_LINE_FC);
    await act(async () =>
      root.render(
        createElement(TownPicker, {
          stats: STATS,
          locators: overview.locators,
          tileOutline: overview.tileOutline,
        }),
      ),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const item = (slug: string) =>
    container.querySelector(`[data-town-card="${slug}"]`)!.closest("li")!;

  it("credits the photo, with a link to its source, once it has really loaded", async () => {
    const li = item("brunswick");
    expect(li.querySelector("[data-town-photo-credit]")).toBeNull();

    await settle(li.querySelector("img")!, "photo");

    const credit = li.querySelector("[data-town-photo-credit]");
    expect(credit?.textContent).toBe(
      `Photo: ${TOWN_PHOTOS.brunswick.author} · ${TOWN_PHOTOS.brunswick.license}`,
    );
    expect(credit?.querySelector("a")?.getAttribute("href")).toBe(TOWN_PHOTOS.brunswick.source_url);
    // The credit sits outside the card link, so it never joins the card's name.
    expect(item("brunswick").querySelector("[data-town-card] [data-town-photo-credit]")).toBeNull();
  });

  it.each(["signal", "error"] as const)(
    "swaps a failed photo (%s) for the town on the county map, with no credit",
    async (outcome) => {
      const li = item("thurmont");
      await settle(li.querySelector("img")!, outcome);

      expect(li.querySelector("img")).toBeNull();
      expect(li.querySelector("[data-town-tile]")).not.toBeNull();
      expect(li.querySelector("[data-town-photo-credit]")).toBeNull();
    },
  );
});
