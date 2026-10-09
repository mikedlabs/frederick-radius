// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveLineForIntent, liveSuggestionForDeck, useDeckLiveKeys } from "./CompassHub";
const NOW = "2026-10-09T16:00:00.000Z";
let root: Root;
let host: HTMLDivElement;
function Probe() {
  const keys = useDeckLiveKeys();
  return createElement("div", null, liveLineForIntent("get-around", keys), createElement("output", null, liveSuggestionForDeck(keys, 8)?.label ?? "No current interruption"));
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("mounted Tools accepted reading expiry", () => {
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
