// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapList from "./MapList";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
describe("map recovery search truth", () => {
  let root: Root;
  let container: HTMLDivElement;
  const retry = vi.fn();
  beforeEach(() => { retry.mockClear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  async function render(searchState: "pending" | "unavailable" | "ready") {
    await act(async () => root.render(<MapList places={[]} events={[]} userLoc={null} failureMode searchState={searchState} onRetrySearch={retry} onPick={() => {}} onPickEvent={() => {}} />));
  }
  it("does not announce zero results while the current search is pending", async () => {
    await render("pending");
    expect(container.textContent).toContain("Searching Radius");
    expect(container.textContent).not.toContain("0 places");
    expect(container.textContent).not.toContain("No fallback results");
  });
  it("reports a failed search as unavailable and retries that existing request", async () => {
    await render("unavailable");
    expect(container.textContent).toContain("Search is temporarily unavailable");
    expect(container.textContent).not.toContain("0 places");
    expect(container.textContent).not.toContain("No fallback results");
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(retry).toHaveBeenCalledOnce();
  });
  it("reserves the zero-result state for a settled successful search", async () => {
    await render("pending");
    await render("ready");
    expect(container.textContent).toContain("0 places available");
    expect(container.textContent).toContain("No fallback results are available");
    expect(container.textContent).not.toContain("Searching Radius");
  });
  it("stays quiet while the dock's search panel already shows the status and its retry", async () => {
    for (const state of ["pending", "unavailable"] as const) {
      await act(async () => root.render(<MapList places={[]} events={[]} userLoc={null} failureMode searchState={state} searchFeedbackInDock onRetrySearch={retry} onPick={() => {}} onPickEvent={() => {}} />));
      expect(container.querySelector("button")).toBeNull();
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.textContent).not.toContain("Searching Radius");
      expect(container.textContent).not.toContain("No fallback results");
      expect(container.textContent).not.toContain("0 places");
    }
  });
  it("feeds the actual query settlement and failure markers into the recovery list", () => {
    const source = readFileSync("src/components/map/AppMap.tsx", "utf8");
    const recovery = source.slice(source.indexOf('places={mapFallbackResults'), source.indexOf('onPick={openPlaceSheet}', source.indexOf('places={mapFallbackResults')));
    expect(recovery).toContain('searchUnavailableQuery === q.trim() ? "unavailable"');
    expect(recovery).toContain('searchSettledQuery !== q.trim() ? "pending"');
    expect(recovery).toContain('onRetrySearch={() => setSearchAttempt');
    expect(recovery).toContain("searchFeedbackInDock={dockSearchPanelVisible}");
    expect(source).toContain("onSearchPanelVisibleChange={setDockSearchPanelVisible}");
  });

});
