// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMapSelectionOpener,
  rememberMapSelectionOpener,
  restoreMapSelectionOpenerFocus,
  takeMapSelectionOpener,
} from "./mapSelectionFocus";

afterEach(() => {
  clearMapSelectionOpener();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function runAnimationFramesImmediately() {
  vi.stubGlobal(
    "requestAnimationFrame",
    (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
  );
}

describe("map selection opener focus", () => {
  it("keeps the original opener while a person switches selected pins", () => {
    const dock = document.createElement("div");
    dock.dataset.mapDock = "";
    const first = document.createElement("button");
    const second = document.createElement("button");
    dock.append(first, second);
    document.body.append(dock);

    first.focus();
    rememberMapSelectionOpener();
    second.focus();
    rememberMapSelectionOpener();

    expect(takeMapSelectionOpener()?.exact).toBe(first);
  });

  it("restores the exact opener after a browser-history close", () => {
    runAnimationFramesImmediately();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    rememberMapSelectionOpener();
    document.body.focus();

    restoreMapSelectionOpenerFocus();

    expect(document.activeElement).toBe(opener);
    expect(takeMapSelectionOpener()).toBeNull();
  });

  it("falls back to the map search when the exact result trigger disappeared", () => {
    runAnimationFramesImmediately();
    const dock = document.createElement("div");
    dock.dataset.mapDock = "";
    const search = document.createElement("input");
    search.setAttribute("role", "combobox");
    const result = document.createElement("button");
    dock.append(search, result);
    document.body.append(dock);
    result.focus();
    rememberMapSelectionOpener();
    result.remove();

    restoreMapSelectionOpenerFocus();

    expect(document.activeElement).toBe(search);
  });
});
