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

  it("reserves the visible top context rail above fitted geography", () => {
    expect(
      mapCameraPadding({
        viewportWidth: 390,
        viewportHeight: 844,
        mapTop: 112,
        mapBottom: 760,
        dockTop: 696,
        dockBottom: 748,
        contextRailBottom: 214,
      }),
    ).toMatchObject({
      top: 118,
      bottom: 84,
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
  it("keeps the selected point above the real 390px card obstruction", () => {
    const mapTop = 57;
    const mapBottom = 777;
    const selectionTop = 323.796875;
    const padding = mapCameraPadding({
      viewportWidth: 390,
      viewportHeight: 844,
      mapTop,
      mapBottom,
      dockTop: 698,
      contextRailBottom: 130,
      selectionTop,
    });
    const pointY = mapTop + (mapBottom - mapTop) / 2 +
      (padding.top - padding.bottom) / 2;
    expect(padding.bottom).toBe(470);
    expect(pointY).toBeGreaterThan(130 + 16);
    expect(pointY).toBeLessThan(selectionTop - 16);
  });

  it("reserves a bottom place card below the desktop dock", () => {
    const padding = mapCameraPadding({
      viewportWidth: 1440,
      viewportHeight: 900,
      mapTop: 88,
      mapBottom: 860,
      dockTop: 96,
      dockBottom: 148,
      selectionTop: 430,
    });
    expect(padding).toEqual({ top: 96, right: 40, bottom: 446, left: 40 });
    const pointY = 88 + (860 - 88) / 2 + (padding.top - padding.bottom) / 2;
    expect(pointY).toBeGreaterThan(148 + 16);
    expect(pointY).toBeLessThan(430 - 16);
  });

  it("preserves existing desktop callers even on a very short map", () => {
    expect(mapCameraPadding({
      viewportWidth: 1440,
      viewportHeight: 900,
      mapTop: 88,
      mapBottom: 128,
      dockBottom: 148,
    })).toEqual({ top: 96, right: 40, bottom: 56, left: 40 });
  });

});
