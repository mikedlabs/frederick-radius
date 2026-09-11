// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import BusesReveal, { buildTransitClosedSummary } from "./BusesReveal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function response(body: object, ok = true): Promise<Response> {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("BusesReveal closed summary", () => {
  let container: HTMLDivElement;
  let root: Root;
  let mounted: boolean;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mounted = true;
  });

  afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps an unavailable vehicle feed distinct from zero buses", () => {
    const summary = buildTransitClosedSummary(
      { available: false, status: "unavailable", vehicles: [] },
      { available: true, status: "ok", alerts: [] },
    );

    expect(summary.text).toBe(
      "Bus locations unavailable · no service alerts posted",
    );
    expect(summary.text).not.toContain("No buses reporting");
    expect(summary.tone).toBe("attention");
  });

  it("shows live counts, service alerts, and degraded arrival estimates", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const href = String(input);
      if (href.endsWith("/vehicles")) {
        return response({
          available: true,
          status: "degraded",
          vehicles: [{ id: "1" }],
        });
      }
      return response({
        available: true,
        status: "ok",
        alerts: [{ id: "a" }, { id: "b" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => root.render(createElement(BusesReveal)));
    await settle();

    expect(container.textContent).toContain(
      "1 bus reporting · 2 service alerts · ETAs limited",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/transit/vehicles",
      "/api/transit/alerts",
    ]);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("shapes")))
      .toBe(false);
    expect(container.querySelector("#pulse-live-buses-summary")?.className)
      .toContain("truncate");
  });

  it("shows an honest successful empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) =>
        response(
          String(input).endsWith("/vehicles")
            ? { available: true, status: "ok", vehicles: [] }
            : { available: true, status: "ok", alerts: [] },
        ),
      ),
    );

    await act(async () => root.render(createElement(BusesReveal)));
    await settle();

    expect(container.textContent).toContain(
      "No buses reporting positions · no service alerts posted",
    );
  });

  it("opens the live map in a fixed detail sheet without moving the briefing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) => {
        const href = String(input);
        if (href.endsWith("/shapes")) {
          return response({
            shapes: { type: "FeatureCollection", features: [{}] },
          });
        }
        return response(
          href.endsWith("/vehicles")
            ? { available: true, status: "ok", vehicles: [] }
            : { available: true, status: "ok", alerts: [] },
        );
      }),
    );

    await act(async () => root.render(createElement(BusesReveal)));
    await settle();

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="pulse-live-buses"]',
    );
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Buses right now");
    expect(dialog?.className).toContain("fixed");
    expect(document.body.querySelector("#pulse-live-buses")).not.toBeNull();
  });

  it("aborts both inexpensive status requests when unmounted", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((_input, init) => {
        signals.push(init?.signal as AbortSignal);
        return new Promise<Response>(() => undefined);
      }),
    );

    await act(async () => root.render(createElement(BusesReveal)));
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);

    await act(async () => root.unmount());
    mounted = false;
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
