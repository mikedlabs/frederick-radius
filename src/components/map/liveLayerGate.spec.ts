import { describe, expect, it } from "vitest";
import { createLiveLayerCloserRegistry } from "./liveLayerGate";

/**
 * The one-foreground contract this seam restores. Seven live layers own
 * their popup state internally; before the gate reached them, a bus popup
 * and a place card could sit open at once, in either order. The registry is
 * the pure half of the fix — AppMap calls closeAll() inside its selection
 * gate, and each layer runs the gate before opening its own popup.
 */
describe("live layer closer registry", () => {
  it("closes every registered popup on a gate clear", () => {
    const registry = createLiveLayerCloserRegistry();
    const open = { buses: "bus-12", marc: "train-871" as string | null };
    registry.register(() => {
      open.buses = null as unknown as string;
    });
    registry.register(() => {
      open.marc = null;
    });

    registry.closeAll();

    expect(open.buses).toBeNull();
    expect(open.marc).toBeNull();
  });

  it("lets the opening layer win when it clears first and sets second", () => {
    // The layer-side contract: gate.onWillOpen() (which runs closeAll), then
    // set your own popup. Written as the layers execute it, so the ordering
    // that makes React's batching land one survivor is pinned here.
    const registry = createLiveLayerCloserRegistry();
    let buses: string | null = "bus-12";
    let incidents: string | null = null;
    registry.register(() => {
      buses = null;
    });
    registry.register(() => {
      incidents = null;
    });

    registry.closeAll();
    incidents = "crash-3";

    expect(buses).toBeNull();
    expect(incidents).toBe("crash-3");
  });

  it("unregistering removes exactly that closer", () => {
    const registry = createLiveLayerCloserRegistry();
    let a = "open";
    let b = "open";
    const unregisterA = registry.register(() => {
      a = "closed";
    });
    registry.register(() => {
      b = "closed";
    });

    unregisterA();
    registry.closeAll();

    expect(a).toBe("open");
    expect(b).toBe("closed");
  });

  it("survives a closer that unregisters itself mid-clear", () => {
    // An unmounting layer's cleanup can race a clear; Set iteration
    // tolerates deletion of the current entry, and the rest still run.
    const registry = createLiveLayerCloserRegistry();
    let first = "open";
    let second = "open";
    const unregisterFirst = registry.register(() => {
      first = "closed";
      unregisterFirst();
    });
    registry.register(() => {
      second = "closed";
    });

    registry.closeAll();

    expect(first).toBe("closed");
    expect(second).toBe("closed");
  });

  it("closeAll on an empty registry is a quiet no-op", () => {
    expect(() => createLiveLayerCloserRegistry().closeAll()).not.toThrow();
  });
});
