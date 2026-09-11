import { describe, it, expect } from "vitest";
import {
  shouldCancelPlaceReturnBridgeAfterDelete,
  toggleSlug,
} from "@/hooks/useFollows";

/**
 * toggleSlug is the pure core of the optimistic follow path. The hook
 * flips the shared store with this BEFORE the network write, and uses
 * `wasFollowed` to pick POST vs DELETE and to drive the revert. These
 * tests lock the two invariants the optimistic UI depends on:
 *   1. membership flips correctly in both directions, and
 *   2. the input set is never mutated (the revert path reuses it).
 */
describe("toggleSlug", () => {
  it("adds a slug that is not yet followed and reports wasFollowed=false", () => {
    const current = new Set<string>(["volt", "the-wine-kitchen"]);
    const { next, wasFollowed } = toggleSlug(current, "brewers-alley");
    expect(wasFollowed).toBe(false);
    expect(next.has("brewers-alley")).toBe(true);
    expect(next.size).toBe(3);
  });

  it("removes a slug that is already followed and reports wasFollowed=true", () => {
    const current = new Set<string>(["volt", "brewers-alley"]);
    const { next, wasFollowed } = toggleSlug(current, "brewers-alley");
    expect(wasFollowed).toBe(true);
    expect(next.has("brewers-alley")).toBe(false);
    expect(next.size).toBe(1);
  });

  it("does not mutate the input set (revert relies on the original)", () => {
    const current = new Set<string>(["volt"]);
    const { next } = toggleSlug(current, "brewers-alley");
    expect(current.has("brewers-alley")).toBe(false);
    expect(current.size).toBe(1);
    expect(next).not.toBe(current);
  });

  it("round-trips back to the original membership", () => {
    const start = new Set<string>(["volt"]);
    const added = toggleSlug(start, "sky-stage").next;
    const removed = toggleSlug(added, "sky-stage").next;
    expect([...removed].sort()).toEqual([...start].sort());
  });
});

describe("place Return Bridge cleanup", () => {
  it("cancels only after a successful delete leaves the latest store empty", () => {
    expect(
      shouldCancelPlaceReturnBridgeAfterDelete(
        true,
        new Set<string>(),
        "brewers-alley",
      ),
    ).toBe(true);
  });

  it("preserves the signal when the delete failed or another follow remains", () => {
    expect(
      shouldCancelPlaceReturnBridgeAfterDelete(
        true,
        new Set<string>(["brewers-alley"]),
        "brewers-alley",
      ),
    ).toBe(false);
    expect(
      shouldCancelPlaceReturnBridgeAfterDelete(
        true,
        new Set<string>(["sky-stage"]),
        "brewers-alley",
      ),
    ).toBe(false);
    expect(
      shouldCancelPlaceReturnBridgeAfterDelete(
        false,
        new Set<string>(),
        "brewers-alley",
      ),
    ).toBe(false);
  });
});
