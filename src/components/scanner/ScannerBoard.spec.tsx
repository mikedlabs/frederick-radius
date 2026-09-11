// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScannerIncident } from "@/lib/integrations/scannerIncidents";

vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

import ScannerBoard from "./ScannerBoard";

let container: HTMLDivElement;
let root: Root;

const incident: ScannerIncident = {
  kind: "Crash",
  location: "100 block N Market St",
  time: "9:00 am",
  roadImpact: true,
  at: "2026-08-27T13:00:00.000Z",
  firstAt: "2026-08-27T13:00:00.000Z",
  updates: 1,
};

function scannerResponse(
  body: object,
  status: number,
): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("ScannerBoard source honesty", () => {
  it("renders an initial outage as unavailable, not a quiet all-clear", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => scannerResponse({
        status: "unavailable",
        incidents: [],
        reason: "timeout",
      }, 503)),
    );

    await act(async () => {
      root.render(createElement(ScannerBoard, {
        initial: [],
        initialAvailable: false,
      }));
    });
    await settle();

    expect(container.textContent).toContain("Unavailable");
    expect(container.textContent).toContain(
      "Live dispatch is temporarily unavailable",
    );
    expect(container.textContent).toContain("This is not an all-clear");
    expect(container.textContent).not.toContain(
      "Nothing on the public wire right now",
    );
  });

  it("keeps last verified calls visible when a later poll times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => scannerResponse({
        status: "unavailable",
        incidents: [],
        reason: "timeout",
      }, 503)),
    );

    await act(async () => {
      root.render(createElement(ScannerBoard, {
        initial: [incident],
        initialAvailable: true,
      }));
    });
    await settle();

    expect(container.textContent).toContain("100 block N Market St");
    expect(container.textContent).toContain("Unavailable");
    expect(container.textContent).toContain(
      "These are the last calls Radius verified, not a current all-clear.",
    );
  });
});
