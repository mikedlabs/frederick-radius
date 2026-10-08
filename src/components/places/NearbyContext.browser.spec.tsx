// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WikiContext } from "@/lib/integrations/wikiContext";

const ARTICLES: WikiContext[] = [
  {
    pageId: 1,
    title: "Hessian Barracks",
    extract: "Hessian Barracks is an historic barracks building in Frederick.",
    url: "https://en.wikipedia.org/wiki/Hessian_Barracks",
    distanceM: 277,
    lat: 39.41,
    lng: -77.41,
    thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Hessian.jpg/112px-Hessian.jpg",
  },
  {
    pageId: 2,
    title: "Maryland School for the Deaf",
    extract: "The Maryland School for the Deaf is a public school in Frederick.",
    url: "https://en.wikipedia.org/wiki/Maryland_School_for_the_Deaf",
    distanceM: 287,
    lat: 39.41,
    lng: -77.41,
  },
];

vi.mock("@/lib/integrations/wikiContext", () => ({
  getNearbyWikipedia: vi.fn(async () => ARTICLES),
}));

import NearbyContext from "./NearbyContext";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("NearbyContext thumbnails", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const element = await NearbyContext({ lat: 39.41, lng: -77.41, excludeName: "Black Hog BBQ" });
    act(() => root.render(element));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows an article's own thumbnail while it loads and gives a thumbless article no frame", () => {
    expect(host.querySelectorAll("img")).toHaveLength(1);
    expect(host.querySelectorAll("[data-radius-photo]")).toHaveLength(1);
    expect(host.textContent).toContain("Maryland School for the Deaf");
  });

  it("collapses a thumbnail that fails, so the row reads as text", async () => {
    await act(async () => {
      host.querySelector("img")!.dispatchEvent(new Event("error"));
    });

    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-radius-photo]")).toBeNull();
    expect(host.textContent).toContain("Hessian Barracks");
  });
});
