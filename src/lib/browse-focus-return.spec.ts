// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BROWSE_FOCUS_RETURN_KEY, BROWSE_FOCUS_RETURN_MAX_AGE_MS,
  markBrowseFocusDeparture, resolveBrowseFocusIdentity, restoreBrowseFocusReturn, takeBrowseFocusReturn,
  type BrowseFocusIdentity, type BrowseFocusReturn,
} from "./browse-focus-return";

const SOURCE = "/events?in=frederick&lens=week#results";
const DESTINATION = "/events/actual-record?returnTo=%2Fevents%3Fin%3Dfrederick%26lens%3Dweek%23results";
const NOW = 1_797_000_000_000;
const OPENER: BrowseFocusIdentity = { tagName: "A", id: "", ariaLabel: null, href: "/events/actual-record" };
const value = (source = SOURCE, opener = OPENER): BrowseFocusReturn => ({ v: 1, source, destination: DESTINATION, at: NOW, opener });
const stops: Array<() => void> = [];

function mark(source = SOURCE, destination = DESTINATION, opener = OPENER) {
  markBrowseFocusDeparture(destination, opener, sessionStorage, NOW, source);
}
function visible<T extends HTMLElement>(node: T): T {
  vi.spyOn(node as HTMLElement, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
  return node;
}
function anchor(href = OPENER.href!) {
  const node = visible(document.createElement("a")); node.href = href; node.textContent = "Actual event";
  document.body.append(node); return node;
}
function board(ready = false) {
  const node = document.createElement("main");
  node.setAttribute("data-events-interaction-ready", "true");
  node.setAttribute("data-events-complete", String(ready)); node.setAttribute("aria-busy", String(!ready));
  document.body.append(node); return node;
}
function settle(node: HTMLElement) {
  node.setAttribute("data-events-complete", "true"); node.setAttribute("aria-busy", "false");
}
function begin(transaction = value()) {
  const finished = vi.fn(); stops.push(restoreBrowseFocusReturn(transaction, finished)); return finished;
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  sessionStorage.clear(); document.body.innerHTML = ""; history.replaceState({}, "", SOURCE);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.clearAllTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
  document.body.innerHTML = ""; sessionStorage.clear();
});

describe("native detail departure memory", () => {
  it("stores only bounded stable identity, without the local element or card text", () => {
    const opener = { ...OPENER, text: "Whole card copy is not stored", element: anchor() };
    markBrowseFocusDeparture(DESTINATION, opener, sessionStorage, NOW, SOURCE);
    expect(JSON.parse(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)!)).toEqual(value());
  });
  it("preserves the intent on the real detail arrival, then consumes it once on exact Back", () => {
    mark();
    expect(takeBrowseFocusReturn(DESTINATION, false, sessionStorage, NOW + 1_000)).toBeNull();
    expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).not.toBeNull();
    expect(takeBrowseFocusReturn(SOURCE, true, sessionStorage, NOW + 120_000)).toEqual(value());
    expect(takeBrowseFocusReturn(SOURCE, true, sessionStorage, NOW + 120_001)).toBeNull();
  });
  it("keeps query/hash identity exact and discards an unrelated navigation", () => {
    mark();
    expect(takeBrowseFocusReturn("/events?in=county&lens=week#results", true, sessionStorage, NOW)).toBeNull();
    expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
    expect(takeBrowseFocusReturn(SOURCE, true, sessionStorage, NOW)).toBeNull();
  });
  it("does not restore on a fresh visit to the same listing", () => {
    mark();
    expect(takeBrowseFocusReturn(SOURCE, false, sessionStorage, NOW)).toBeNull();
    expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  });
  it.each([BROWSE_FOCUS_RETURN_MAX_AGE_MS + 1, -1])("rejects stale or future intent at age %d", age => {
    mark(); expect(takeBrowseFocusReturn(SOURCE, true, sessionStorage, NOW + age)).toBeNull();
    expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  });
  it.each(["https://elsewhere.test/events/actual-record", "//elsewhere.test/events/actual-record", "/api/events/actual-record", "/events/calendar/extra", "/events/constructor"])("does not persist an unsafe/non-detail destination %s", destination => {
    mark(SOURCE, destination); expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  });
  it.each(["/account", "//elsewhere.test/events", "/api/events"])("does not persist an unsupported source %s", source => {
    mark(source); expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  });
  it.each(["{", JSON.stringify({ ...value(), opener: { ...OPENER, ariaLabel: "x".repeat(513) } }), JSON.stringify({ ...value(), source: "//elsewhere.test/events" }), "x".repeat(16_385)])("discards malformed or excessive metadata without throwing", serialized => {
    sessionStorage.setItem(BROWSE_FOCUS_RETURN_KEY, serialized);
    expect(takeBrowseFocusReturn(SOURCE, true, sessionStorage, NOW)).toBeNull();
    expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  });
  it("does not throw when the browser denies the sessionStorage getter itself", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new Error("storage getter denied"); });
    expect(() => markBrowseFocusDeparture(DESTINATION, OPENER, undefined, NOW, SOURCE)).not.toThrow();
    expect(takeBrowseFocusReturn(SOURCE, true, undefined, NOW)).toBeNull();
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects a nonfinite observation clock %s", now => {
    mark(); expect(takeBrowseFocusReturn(SOURCE, true, sessionStorage, now)).toBeNull();
    expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  });
  it("navigation and reads remain safe when browser storage throws", () => {
    const storage = { getItem: () => { throw new Error("storage denied"); }, setItem: () => { throw new Error("storage denied"); }, removeItem: () => { throw new Error("storage denied"); } };
    expect(() => markBrowseFocusDeparture(DESTINATION, OPENER, storage, NOW, SOURCE)).not.toThrow();
    expect(takeBrowseFocusReturn(SOURCE, true, storage, NOW)).toBeNull();
  });
});

describe("fresh-document opener resolution", () => {
  it("chooses a unique visible href, ignoring a hidden duplicate", () => {
    const hidden = anchor(); hidden.hidden = true;
    const target = anchor(); expect(resolveBrowseFocusIdentity(OPENER)).toBe(target);
  });
  it("does not guess among duplicate visible hrefs or labels", () => {
    anchor(); anchor(); expect(resolveBrowseFocusIdentity(OPENER)).toBeNull();
    for (let i = 0; i < 2; i++) {
      const button = visible(document.createElement("button")); button.setAttribute("aria-label", "View Creek details"); document.body.append(button);
    }
    expect(resolveBrowseFocusIdentity({ tagName: "BUTTON", id: "", href: null, ariaLabel: "View Creek details" })).toBeNull();
  });
  it("accepts a unique stable id and rejects duplicate or disabled targets", () => {
    const target = anchor(); target.id = "original-event";
    const saved = { ...OPENER, id: target.id }; expect(resolveBrowseFocusIdentity(saved)).toBe(target);
    const duplicate = anchor(); duplicate.id = target.id; expect(resolveBrowseFocusIdentity(saved)).toBeNull();
    duplicate.remove(); const otherTag = visible(document.createElement("button")); otherTag.id = target.id; document.body.append(otherTag);
    expect(resolveBrowseFocusIdentity(saved)).toBeNull(); otherTag.remove();
    target.setAttribute("aria-disabled", "true"); expect(resolveBrowseFocusIdentity(saved)).toBeNull();
  });
  it("does not reuse an id that now names a different event or place control", () => {
    const target = anchor("/events/different-record"); target.id = "original-event";
    expect(resolveBrowseFocusIdentity({ ...OPENER, id: target.id })).toBeNull();
    const button = visible(document.createElement("button")); button.id = "place-action"; button.setAttribute("aria-label", "View other place details"); document.body.append(button);
    expect(resolveBrowseFocusIdentity({ tagName: "BUTTON", id: button.id, href: null, ariaLabel: "View Creek details" })).toBeNull();
  });
  it("waits for completed Events data, then focuses the replacement node without scrolling", async () => {
    const root = board(); const preview = anchor(); const previewFocus = vi.spyOn(preview, "focus"); const finished = begin();
    await vi.advanceTimersByTimeAsync(64); expect(previewFocus).not.toHaveBeenCalled();
    preview.remove(); const final = anchor(); const finalFocus = vi.spyOn(final, "focus"); settle(root);
    await vi.advanceTimersByTimeAsync(32);
    expect(finalFocus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true }); expect(document.activeElement).toBe(final); expect(finished).toHaveBeenCalledOnce();
  });
  it("waits for Nearby interactivity and resolves its actual address-specific button", async () => {
    const source = "/nearby?c=outside&in=frederick"; history.replaceState({}, "", source);
    const ready = document.createElement("main"); document.body.append(ready);
    const target = visible(document.createElement("button")); target.setAttribute("aria-label", "View Creek at Main Street details"); document.body.append(target);
    const focus = vi.spyOn(target, "focus"); begin(value(source, { tagName: "BUTTON", id: "", href: null, ariaLabel: target.getAttribute("aria-label") }));
    await vi.advanceTimersByTimeAsync(32); expect(focus).not.toHaveBeenCalled();
    ready.setAttribute("data-nearby-interaction-ready", "true"); await vi.advanceTimersByTimeAsync(32);
    expect(document.activeElement).toBe(target); expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it.each(["pointerdown", "keydown", "wheel", "touchstart", "touchmove"])("a newer %s aborts delayed focus permanently", async event => {
    const root = board(); const target = anchor(); const focus = vi.spyOn(target, "focus"); const finished = begin();
    window.dispatchEvent(new Event(event)); settle(root); await vi.advanceTimersByTimeAsync(11_000);
    expect(focus).not.toHaveBeenCalled(); expect(finished).toHaveBeenCalledOnce();
  });
  it("does not steal focus from another real control", async () => {
    board(true); const target = anchor(); const input = visible(document.createElement("input")); document.body.append(input); input.focus();
    const focus = vi.spyOn(target, "focus"); begin(); await vi.advanceTimersByTimeAsync(32);
    expect(focus).not.toHaveBeenCalled(); expect(document.activeElement).toBe(input);
  });
  it("does not move focus through a competing visible dialog or return invitation", async () => {
    board(true); const target = anchor(); const focus = vi.spyOn(target, "focus");
    const dialog = visible(document.createElement("aside")); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
    begin(); await vi.advanceTimersByTimeAsync(32); dialog.remove(); await vi.advanceTimersByTimeAsync(32);
    expect(focus).not.toHaveBeenCalled();
    const offer = visible(document.createElement("aside")); offer.setAttribute("data-return-bridge", ""); document.body.append(offer);
    begin(); await vi.advanceTimersByTimeAsync(32); expect(focus).not.toHaveBeenCalled();
  });
  it("ignores the mounted aria-hidden filter shell", async () => {
    board(true); const target = anchor(); const shell = visible(document.createElement("aside")); shell.setAttribute("role", "dialog"); shell.setAttribute("aria-hidden", "true"); document.body.append(shell);
    begin(); await vi.advanceTimersByTimeAsync(32); expect(document.activeElement).toBe(target);
  });
  it("stops at its deadline if the target is missing, without replay on a later insertion", async () => {
    board(true); const finished = begin(); await vi.advanceTimersByTimeAsync(10_100); expect(finished).toHaveBeenCalledOnce();
    const target = anchor(); const focus = vi.spyOn(target, "focus"); await vi.advanceTimersByTimeAsync(32); expect(focus).not.toHaveBeenCalled();
  });
  it("cleanup supports Strict Mode replay without old tasks surviving", async () => {
    const root = board(); const target = anchor(); const focus = vi.spyOn(target, "focus"); const first = begin(); stops.pop()!();
    const replay = begin(); settle(root); await vi.advanceTimersByTimeAsync(32);
    expect(first).not.toHaveBeenCalled(); expect(replay).toHaveBeenCalledOnce(); expect(focus).toHaveBeenCalledOnce();
  });
  it("stops if the exact route changes before the target becomes ready", async () => {
    const root = board(); const target = anchor(); const focus = vi.spyOn(target, "focus"); begin();
    history.replaceState({}, "", "/events?in=county"); settle(root); await vi.advanceTimersByTimeAsync(32); expect(focus).not.toHaveBeenCalled();
  });
});
