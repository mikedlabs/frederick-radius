// @vitest-environment jsdom

import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapModeGate from "./MapModeGate";

const deferred = vi.hoisted(() => ({
  imports: vi.fn(),
  ready: Promise.resolve(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: (load: () => Promise<{ default: ComponentType }>, options: { loading?: ComponentType }) => {
      const Lazy = React.lazy(async () => {
        deferred.imports();
        await deferred.ready;
        return load();
      });
      return function DemandLoadedMode() {
        return React.createElement(React.Suspense, {
          fallback: options.loading ? React.createElement(options.loading) : null,
        }, React.createElement(Lazy));
      };
    },
  };
});
vi.mock("@/components/radius/DeferredRadiusBuilder", () => ({
  default: () => <section aria-label="Radius controls"><button type="button">Adjust the radius</button></section>,
}));
vi.mock("@/components/ui/PageBloom", () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  deferred.imports.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

/** Exercise the real mode selection and fallback while the chunk boundary is
 * held. The compiled-asset check separately verifies Next's actual split. */
describe("map mode demand loading", () => {
  it("keeps browse usable without loading radius, then honors the radius deep link and return", async () => {
    let release!: () => void;
    deferred.ready = new Promise<void>((resolve) => { release = resolve; });
    const render = () => root.render(createElement(MapModeGate, {
      browse: <section aria-label="County browse"><button type="button">Find on the map</button></section>,
    }));
    const returnTo = "/search?q=coffee&in=brunswick";
    const context = new URLSearchParams({ in: "brunswick", returnTo });
    window.history.replaceState(null, "", `/map?${context}`);
    await act(async () => render());
    expect(container.querySelector('[aria-label="County browse"]')).not.toBeNull();
    expect(deferred.imports).not.toHaveBeenCalled();

    context.set("mode", "radius");
    window.history.replaceState(null, "", `/map?${context}`);
    await act(async () => render());
    expect(deferred.imports).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-label="County browse"]')).toBeNull();
    const loading = container.querySelector('[role="status"]');
    expect(loading?.getAttribute("aria-label")).toBe("The nearby map controls are loading.");
    expect(loading?.getAttribute("aria-busy")).toBe("true");
    expect(new URLSearchParams(location.search).get("in")).toBe("brunswick");
    expect(new URLSearchParams(location.search).get("returnTo")).toBe(returnTo);
    await act(async () => { release(); await deferred.ready; });
    await vi.waitFor(() => expect(container.querySelector('[aria-label="Radius controls"]')).not.toBeNull());
    const adjust = container.querySelector("button")!;
    adjust.focus();
    expect(document.activeElement).toBe(adjust);

    context.delete("mode");
    window.history.replaceState(null, "", `/map?${context}`);
    await act(async () => render());
    expect(container.querySelector('[aria-label="County browse"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Radius controls"]')).toBeNull();
    expect(new URLSearchParams(location.search).get("returnTo")).toBe(returnTo);
    expect(deferred.imports).toHaveBeenCalledTimes(1);
  });
});
