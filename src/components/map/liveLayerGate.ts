import { useEffect, useRef } from "react";

/**
 * The browse map promises ONE foreground result (AppMap's clearMapSelection
 * gate), but seven live layers — buses, MARC trains, scanner incidents,
 * rotorcraft, work zones, snow routes, flood context — own their popup state
 * internally, where the gate could not reach it. Tap a bus and then a place
 * and both cards sat open; tap a place and then a bus and the stale place
 * card stayed under the bus popup. Exactly the double-exposure the gate
 * exists to prevent, in either order.
 *
 * This is the seam that puts those popups under the gate without moving
 * their state up into AppMap's six-thousand-line component:
 *
 *  - `register` hands the gate a closer for the layer's popup. The gate calls
 *    every registered closer whenever it clears, so opening a place closes
 *    every live popup.
 *  - `onWillOpen` is called by a layer immediately BEFORE it opens its own
 *    popup. It runs the full gate clear — foreground card, sibling layers,
 *    and this layer's own closer. The layer's set-state follows in the same
 *    handler, so React's batching lands its popup as the one survivor.
 *
 * A layer given no gate behaves exactly as before, which keeps every other
 * mount site (storybook-style probes, standalone embeds) working unchanged.
 */
export type LiveLayerGate = {
  /** Returns the unregister cleanup, ready to hand straight to useEffect. */
  register: (close: () => void) => () => void;
  onWillOpen: () => void;
};

/**
 * The closer registry behind AppMap's side of the gate. A layer's `close`
 * runs on every clear; unregistering mid-clear is safe because a Set
 * tolerates deletion during iteration. Pure so the one-foreground contract
 * is testable without mounting the six-thousand-line map component.
 */
export function createLiveLayerCloserRegistry(): {
  register: (close: () => void) => () => void;
  closeAll: () => void;
} {
  const closers = new Set<() => void>();
  return {
    register: (close) => {
      closers.add(close);
      return () => {
        closers.delete(close);
      };
    },
    closeAll: () => {
      for (const close of closers) close();
    },
  };
}

/** `close` may be an inline arrow — it rides a ref, so the registration
 *  itself lasts the component's lifetime instead of churning per render. */
export function useLiveLayerGate(
  gate: LiveLayerGate | undefined,
  close: () => void,
): void {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => gate?.register(() => closeRef.current()), [gate]);
}
