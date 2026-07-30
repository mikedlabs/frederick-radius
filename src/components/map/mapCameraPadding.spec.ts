import { describe, expect, it } from "vitest";
import { mapCameraPadding } from "./mapCameraPadding";

describe("mapCameraPadding", () => {
  it("reserves a bottom-mounted phone instrument below the geography", () => {
    expect(
      mapCameraPadding({
        viewportWidth: 390,
        viewportHeight: 844,
        mapTop: 112,
        mapBottom: 760,
        dockTop: 696,
        dockBottom: 748,
      }),
    ).toEqual({
      top: 20,
      right: 20,
      bottom: 84,
      left: 20,
    });
  });

  it("includes the visible active-state sentence above the phone dock", () => {
    expect(
      mapCameraPadding({
        viewportWidth: 390,
        viewportHeight: 844,
        mapTop: 112,
        mapBottom: 760,
        dockTop: 696,
        dockBottom: 748,
        activeStateTop: 650,
      }),
    ).toMatchObject({
      top: 20,
      bottom: 126,
    });
  });

  it("reserves an open phone sheet without consuming the entire canvas", () => {
    const padding = mapCameraPadding({
      viewportWidth: 390,
      viewportHeight: 844,
      mapTop: 112,
      mapBottom: 760,
      dockTop: 696,
      dockBottom: 748,
      paneTop: 390,
    });

    expect(padding.top).toBe(20);
    expect(padding.bottom).toBe(386);
    expect(padding.bottom).toBeLessThan(760 - 112);
  });

  it("keeps the top-mounted desktop dock above fitted geography", () => {
    expect(
      mapCameraPadding({
        viewportWidth: 1440,
        viewportHeight: 900,
        mapTop: 88,
        mapBottom: 860,
        dockTop: 96,
        dockBottom: 148,
      }),
    ).toEqual({
      top: 96,
      right: 40,
      bottom: 56,
      left: 40,
    });
  });

  it("uses compact first-paint fallbacks before the dock is measured", () => {
    expect(
      mapCameraPadding({
        viewportWidth: 390,
        viewportHeight: 844,
        mapTop: 0,
        mapBottom: 844,
      }),
    ).toEqual({
      top: 20,
      right: 20,
      bottom: 84,
      left: 20,
    });
  });
});
