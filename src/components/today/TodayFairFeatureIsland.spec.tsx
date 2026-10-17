// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const loads = vi.hoisted(() => {
  let resolveFeatureImport!: () => void;
  let resolvePlanImport!: () => void;
  const featureImported = new Promise<void>((resolve) => { resolveFeatureImport = resolve; });
  const planImported = new Promise<void>((resolve) => { resolvePlanImport = resolve; });
  return {
    feature: vi.fn(), plan: vi.fn(), read: vi.fn(() => null),
    featureImported, planImported, resolveFeatureImport, resolvePlanImport,
  };
});
vi.mock("./TodayFairFeature", async (importOriginal) => {
  loads.feature();
  // Exercise the real cold import path beyond vi.waitFor's former one-second
  // deadline, rather than preloading the component before it is mounted.
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const feature = await importOriginal<typeof import("./TodayFairFeature")>();
  loads.resolveFeatureImport();
  return feature;
});
vi.mock("@/lib/fair/plan", () => {
  loads.plan();
  loads.resolvePlanImport();
  return { readFairPlan: loads.read };
});
import TodayFairFeatureIsland from "./TodayFairFeatureIsland";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("leaves inactive feature and plan modules unloaded, then loads the mounted campaign and stops reading after unmount", async () => {
  // Importing Today's lightweight client boundary must not evaluate either
  // the campaign component or its Zod-backed plan reader.
  expect(loads.feature).not.toHaveBeenCalled();
  expect(loads.plan).not.toHaveBeenCalled();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(TodayFairFeatureIsland, { phase: "planning", briefing: true })));
    // Flush the completed component import before awaiting its effect's plan
    // import. Awaiting an effect-dependent signal in the initial render phase
    // would prevent React from committing the component that starts it.
    await act(async () => { await loads.featureImported; });
    await act(async () => { await loads.planImported; });
    expect(container.textContent).toContain("Plan your Fair day");
    expect(loads.read).toHaveBeenCalledOnce();
    expect(loads.feature).toHaveBeenCalledOnce();
    expect(loads.plan).toHaveBeenCalledOnce();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/moments/great-frederick-fair-2026#now");

    await act(async () => root.render(null));
    const previousReads = loads.read.mock.calls.length;
    // Mount and remove before the cached dynamic import's Promise resolves.
    // Its late completion must not inspect storage or update an absent card.
    act(() => root.render(createElement(TodayFairFeatureIsland, { phase: "planning", briefing: true })));
    act(() => root.render(null));
    await act(async () => { await Promise.resolve(); });
    expect(loads.read).toHaveBeenCalledTimes(previousReads);
    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new StorageEvent("storage"));
    await act(async () => { await Promise.resolve(); });
    expect(loads.read).toHaveBeenCalledTimes(previousReads);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
