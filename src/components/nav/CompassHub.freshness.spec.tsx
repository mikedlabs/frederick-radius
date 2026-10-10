// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveLineForIntent, liveSuggestionForDeck, useDeckLiveKeys } from "./CompassHub";
const NOW = "2026-10-09T16:00:00.000Z";
let root: Root;
let host: HTMLDivElement;
function Probe({ open = false }: { open?: boolean }) {
  const keys = useDeckLiveKeys(open);
  return createElement("div", null, liveLineForIntent("get-around", keys), createElement("output", null, liveSuggestionForDeck(keys, 8)?.label ?? "No current interruption"));
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("mounted Tools accepted reading expiry", () => {
  it("recovers an expired reading on foreground with one deduplicated request and no clock polling", async () => {
    let resolveRefresh!: (response: unknown) => void;
    const pending = new Promise((resolve) => { resolveRefresh = resolve; });
    const data = (readAt: string, count: string) => ({ readAt, keys: [{ id: "traffic", status: "ok", source: "MDOT CHART", checkedAt: readAt, validUntil: new Date(Date.parse(readAt) + 60_000).toISOString(), faces: [{ value: count, label: "incidents" }] }] });
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => data(NOW, "2") }).mockReturnValueOnce(pending);
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Probe)));
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(host.textContent).toContain("Earlier MDOT CHART report: 2 incidents");
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(host.querySelector("output")?.textContent).toBe("No current interruption");
    await act(async () => resolveRefresh({ ok: true, json: async () => data(new Date(Date.now()).toISOString(), "3") }));
    expect(host.textContent).toContain("3 incidents · MDOT CHART checked");
    expect(host.querySelector("output")?.textContent).toBe("Road incidents");
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retains an earlier reading and its check time when the foreground retry fails", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ readAt: NOW, keys: [{ id: "traffic", status: "ok", source: "MDOT CHART", checkedAt: NOW, validUntil: "2026-10-09T16:01:00.000Z", faces: [{ value: "2", label: "incidents" }] }] }) }).mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Probe)));
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    const earlier = host.textContent;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(host.textContent).toBe(earlier);
    expect(host.textContent).toContain("Unable to verify now");
  });
  it("retries an unavailable initial read when the deck opens, but ignores rapid repeated opens", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue({ ok: true, json: async () => ({ readAt: new Date(Date.now()).toISOString(), keys: [{ id: "traffic", status: "ok", source: "MDOT CHART", checkedAt: new Date(Date.now()).toISOString(), validUntil: new Date(Date.now() + 60_000).toISOString(), faces: [{ value: "1", label: "incident" }] }] }) });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Probe)));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    await act(async () => root.render(createElement(Probe, { open: true })));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("1 incident · MDOT CHART checked");
    await act(async () => root.render(createElement(Probe, { open: false })));
    await act(async () => root.render(createElement(Probe, { open: true })));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("expires the accepted count at its source boundary without another provider request", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ readAt: NOW, keys: [{ id: "traffic", status: "ok", source: "MDOT CHART", checkedAt: NOW, validUntil: "2026-10-09T16:01:00.000Z", faces: [{ value: "2", label: "incidents" }] }] }) });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Probe)));
    expect(host.textContent).toContain("2 incidents · MDOT CHART checked");
    expect(host.querySelector("output")?.textContent).toBe("Road incidents");
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(host.textContent).toContain("Earlier MDOT CHART report: 2 incidents");
    expect(host.textContent).toContain("Unable to verify now");
    expect(host.querySelector("output")?.textContent).toBe("No current interruption");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not give an unverifiable response a fresh local clock", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: [{ id: "traffic", status: "ok", source: "MDOT CHART", faces: [{ value: "Clear", label: "no incidents" }] }] }) }));
    await act(async () => root.render(createElement(Probe)));
    expect(host.textContent).toContain("Unable to verify MDOT CHART");
    expect(host.textContent).not.toContain("Clear");
  });
});
