// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FAIR_AERIAL_URL, useFairAerialStatus } from "./FairAerialLayer";

let image: FakeImage;
function captureImage(instance: FakeImage) { image = instance; }
class FakeImage {
  naturalWidth = 2560;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() { captureImage(this); }
}
let host: HTMLDivElement;
let root: Root;
function Status({ enabled }: { enabled: boolean }) {
  return createElement("span", null, useFairAerialStatus(enabled));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Image", FakeImage);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("loads only the self-hosted image before enabling the aerial", () => {
  act(() => root.render(createElement(Status, { enabled: true })));
  expect(image.src).toBe(FAIR_AERIAL_URL);
  expect(host.textContent).toBe("loading");
  act(() => image.onload?.());
  expect(host.textContent).toBe("ready");
});
it("leaves the clear-map fallback available if the image fails or stalls", () => {
  act(() => root.render(createElement(Status, { enabled: true })));
  act(() => vi.advanceTimersByTime(10_000));
  expect(host.textContent).toBe("unavailable");
  expect(image.onload).toBeNull();
});
it("does not treat a broken image as an available aerial", () => {
  act(() => root.render(createElement(Status, { enabled: true })));
  image.naturalWidth = 0;
  act(() => image.onload?.());
  expect(host.textContent).toBe("unavailable");
});
it("disarms callbacks when the visitor switches to the clear map", () => {
  act(() => root.render(createElement(Status, { enabled: true })));
  act(() => root.render(createElement(Status, { enabled: false })));
  expect(image.onload).toBeNull();
  expect(image.onerror).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
