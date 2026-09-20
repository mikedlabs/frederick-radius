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
  const { retry, status } = useFairAerialStatus(enabled);
  return createElement(
    "div",
    null,
    createElement("span", { "data-status": "" }, status),
    createElement("button", { type: "button", onClick: retry }, "Retry"),
  );
}
function statusText() {
  return host.querySelector("[data-status]")?.textContent;
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
  expect(statusText()).toBe("loading");
  act(() => image.onload?.());
  expect(statusText()).toBe("ready");
});
it("leaves the clear-map fallback available if the image fails or stalls", () => {
  act(() => root.render(createElement(Status, { enabled: true })));
  act(() => vi.advanceTimersByTime(10_000));
  expect(statusText()).toBe("unavailable");
  expect(image.onload).toBeNull();
});
it("does not treat a broken image as an available aerial", () => {
  act(() => root.render(createElement(Status, { enabled: true })));
  image.naturalWidth = 0;
  act(() => image.onload?.());
  expect(statusText()).toBe("unavailable");
});
it("starts a fresh image request when the visitor retries", () => {
  act(() => root.render(createElement(Status, { enabled: true })));
  act(() => image.onerror?.());
  expect(statusText()).toBe("unavailable");

  const retry = host.querySelector<HTMLButtonElement>("button");
  if (!retry) throw new Error("Expected a retry button.");
  act(() => retry.click());
  expect(statusText()).toBe("loading");
  expect(image.src).toBe(FAIR_AERIAL_URL);
  act(() => image.onload?.());
  expect(statusText()).toBe("ready");
});
it("disarms callbacks when the visitor switches to the clear map", () => {
  act(() => root.render(createElement(Status, { enabled: true })));
  act(() => root.render(createElement(Status, { enabled: false })));
  expect(image.onload).toBeNull();
  expect(image.onerror).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
