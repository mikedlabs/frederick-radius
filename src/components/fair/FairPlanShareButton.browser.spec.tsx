// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import FairPlanShareButton, { fairPicksShareText, type FairPicksShare } from "./FairPlanShareButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const picks: FairPicksShare = { dateLabel: "Sun, Sep 20", scheduleItems: [], vendors: [{ id: "vendor-white-rabbit-rad-pies", name: "White Rabbit x Rad Pies" }] };

describe("Share saved Fair stops", () => {
  let container: HTMLDivElement;
  let root: Root;
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    window.history.replaceState({}, "", "/moments/great-frederick-fair-2026?car=private&party=4&latitude=39.4#my-day");
    writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.spyOn(window, "prompt").mockReturnValue(null);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
  async function share() { act(() => root.render(createElement(FairPlanShareButton, picks))); await act(async () => container.querySelector<HTMLButtonElement>("button")?.click()); }

  it("shares a vendor-only day's picks and only public canonical links", async () => {
    await share();
    const text = writeText.mock.calls[0][0];
    expect(text).toContain(picks.dateLabel);
    expect(text).toContain("White Rabbit x Rad Pies");
    expect(text).toContain("?vendor=vendor-white-rabbit-rad-pies#fair-map");
    expect(text).not.toMatch(/car=|party=|latitude=|longitude=|private|Scheduled events/);
    expect(container.textContent).toContain("Picks copied");
    expect(fairPicksShareText(window.location.origin, { ...picks, scheduleItems: [{ title: "Horse pull", timeLabel: "7 PM" }] })).toContain("7 PM: Horse pull");
  });
  it("sends the same public picks with native sharing", async () => {
    const nativeShare = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: nativeShare });
    await share();
    expect(nativeShare).toHaveBeenCalledWith({ title: `My Fair picks for ${picks.dateLabel}`, text: fairPicksShareText(window.location.origin, picks) });
    expect(writeText).not.toHaveBeenCalled();
  });
  it("never copies or prompts after the user cancels native sharing", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")) });
    await share();
    expect(writeText).not.toHaveBeenCalled();
    expect(window.prompt).not.toHaveBeenCalled();
  });
  it("falls back to manual copy when sharing and clipboard fail", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new Error("Unavailable")) });
    writeText.mockRejectedValue(new Error("Denied"));
    await share();
    expect(window.prompt).toHaveBeenCalledWith("Copy your saved Fair stops:", fairPicksShareText(window.location.origin, picks));
  });
  it("does not offer an empty share", () => {
    act(() => root.render(createElement(FairPlanShareButton, { ...picks, vendors: [] })));
    expect(container.querySelector("button")).toBeNull();
  });
});
