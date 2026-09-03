// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FairMapCanvasBoundary from "./FairMapCanvasBoundary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function BrokenMap(): never {
  const error = new Error("WebGL2 is required");
  error.name = "GPUInitializationError";
  throw error;
}

function LateBrokenMap({ failed }: { failed: boolean }) {
  if (failed) return <BrokenMap />;
  return (
    <button type="button" data-map-focus>
      Map control
    </button>
  );
}

describe("Fair map canvas resilience", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("shows the local fallback when map initialization throws", async () => {
    const onFailure = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      root.render(
        <FairMapCanvasBoundary
          captureFocus={() => container.contains(document.activeElement)}
          fallback={createElement("p", null, "Searchable map fallback")}
          onFailure={onFailure}
        >
          <BrokenMap />
        </FairMapCanvasBoundary>,
      );
    });

    expect(container.textContent).toContain("Searchable map fallback");
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure.mock.calls[0]?.[0]).toMatchObject({
      name: "GPUInitializationError",
      message: "WebGL2 is required",
    });
  });

  it("captures focus before a late render failure removes the map", async () => {
    const onFailure = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      root.render(
        <FairMapCanvasBoundary
          captureFocus={() => container.contains(document.activeElement)}
          fallback={createElement("p", null, "Searchable map fallback")}
          onFailure={onFailure}
        >
          <LateBrokenMap failed={false} />
        </FairMapCanvasBoundary>,
      );
    });
    const control = container.querySelector<HTMLButtonElement>(
      "[data-map-focus]",
    );
    if (!control) throw new Error("Missing map focus control.");
    control.focus();

    await act(async () => {
      root.render(
        <FairMapCanvasBoundary
          captureFocus={() => container.contains(document.activeElement)}
          fallback={createElement("p", null, "Searchable map fallback")}
          onFailure={onFailure}
        >
          <LateBrokenMap failed />
        </FairMapCanvasBoundary>,
      );
    });

    expect(container.textContent).toContain("Searchable map fallback");
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure.mock.calls[0]?.[1]).toEqual({ focusWasInside: true });
  });
});
