import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapUrlAfterMutation,
  replaceMapUrl,
  replaceMapUrlSilently,
} from "./map-url-state";

describe("map URL state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("changes one lens without dropping the live camera, layers, or query", () => {
    const next = mapUrlAfterMutation(
      "https://frederickradius.app/map?c=-77.4100%2C39.4150%2C12.4&show=transit&layers=parks&q=coffee&music=tonight&t=weekend",
      (params) => {
        params.delete("music");
        params.set("t", "weekend");
      },
    );

    expect(next.searchParams.get("music")).toBeNull();
    expect(next.searchParams.get("t")).toBe("weekend");
    expect(next.searchParams.get("c")).toBe("-77.4100,39.4150,12.4");
    expect(next.searchParams.get("show")).toBe("transit");
    expect(next.searchParams.get("layers")).toBe("parks");
    expect(next.searchParams.get("q")).toBe("coffee");
  });

  it("uses Next's external history path so route search params stay synchronized", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        href: "https://frederickradius.app/map?music=tonight&t=weekend",
      },
      history: {
        state: { __NA: true, custom: "kept by Next" },
        replaceState,
      },
    });

    const next = replaceMapUrl((params) => {
      params.delete("music");
      params.set("t", "weekend");
    });

    expect(next?.pathname).toBe("/map");
    expect(replaceState).toHaveBeenCalledWith(null, "", next);
  });

  it("keeps Next's history marker for presentation-only selection state", () => {
    const nextHistoryState = { __NA: true, tree: "mounted map" };
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        href: "https://frederickradius.app/map?c=-77.4100%2C39.4150%2C12.4&q=coffee",
      },
      history: {
        state: nextHistoryState,
        replaceState,
      },
    });

    const next = replaceMapUrlSilently((params) => {
      params.set("place", "gravel-and-grind-frederick");
    });

    expect(next?.searchParams.get("place")).toBe(
      "gravel-and-grind-frederick",
    );
    expect(replaceState).toHaveBeenCalledWith(nextHistoryState, "", next);
  });
});
