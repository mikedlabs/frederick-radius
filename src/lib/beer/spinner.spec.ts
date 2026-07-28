import { describe, expect, it } from "vitest";
import { buildSpinSequence, nextDistinctIndex } from "./spinner";

describe("nextDistinctIndex", () => {
  it("never returns the previous index when another option exists", () => {
    for (let previous = 0; previous < 5; previous += 1) {
      for (const random of [0, 0.1, 0.49, 0.75, 0.999999]) {
        const next = nextDistinctIndex(5, previous, random);
        expect(next).not.toBe(previous);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(5);
      }
    }
  });

  it("handles empty, single-item, invalid, and boundary inputs", () => {
    expect(nextDistinctIndex(0, null, 0.5)).toBeNull();
    expect(nextDistinctIndex(1, 0, 0.5)).toBe(0);
    expect(nextDistinctIndex(3, 9, -1)).toBe(0);
    expect(nextDistinctIndex(3, null, 1)).toBe(2);
    expect(nextDistinctIndex(3, null, Number.NaN)).toBe(0);
  });
});

describe("buildSpinSequence", () => {
  it("creates a reel without adjacent repeats or an immediate repeat", () => {
    const sequence = buildSpinSequence(4, 2, [0, 0.2, 0.4, 0.6, 0.8], 0.99);

    expect(sequence[0]).not.toBe(2);
    expect(sequence.at(-1)).not.toBe(2);
    for (let index = 1; index < sequence.length; index += 1) {
      expect(sequence[index]).not.toBe(sequence[index - 1]);
    }
  });

  it("cannot cycle back to the previous completed result", () => {
    const previousCompleted = 1;
    const sequence = buildSpinSequence(
      3,
      previousCompleted,
      [0.9, 0, 0.9, 0],
      0.49,
    );

    expect(sequence.at(-1)).not.toBe(previousCompleted);
  });

  it("selects the same winner with or without preview animation", () => {
    const reducedMotion = buildSpinSequence(8, 4, [], 0.72);
    const animated = buildSpinSequence(8, 4, [0, 0.2, 0.4, 0.6, 0.8], 0.72);

    expect(animated.at(-1)).toBe(reducedMotion.at(-1));
  });
});
