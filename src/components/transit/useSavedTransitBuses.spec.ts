import { describe, expect, it } from "vitest";
import { shouldSignalSavedTransitBus } from "./useSavedTransitBuses";

describe("saved transit bus Return Bridge signal", () => {
  it("signals a useful in-session save independently of storage persistence", () => {
    expect(
      shouldSignalSavedTransitBus({ saved: true, limitReached: false }),
    ).toBe(true);
  });

  it("does not signal removals or rejected over-limit saves", () => {
    expect(
      shouldSignalSavedTransitBus({ saved: false, limitReached: false }),
    ).toBe(false);
    expect(
      shouldSignalSavedTransitBus({ saved: true, limitReached: true }),
    ).toBe(false);
  });
});
