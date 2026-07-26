import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestTransitRouteFocus,
  takePendingTransitRouteFocus,
  TRANSIT_ROUTE_FOCUS_EVENT,
} from "./transit-focus";

describe("transit route focus handoff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains a route selected before the map chunk is ready", () => {
    const values = new Map<string, string>();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent,
    });
    vi.stubGlobal("CustomEvent", class {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    });

    requestTransitRouteFocus("6154");

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: TRANSIT_ROUTE_FOCUS_EVENT,
      detail: { routeId: "6154" },
    });
    expect(takePendingTransitRouteFocus()).toBe("6154");
    expect(takePendingTransitRouteFocus()).toBeNull();
  });
});
