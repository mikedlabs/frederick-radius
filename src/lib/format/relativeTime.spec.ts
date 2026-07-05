import { describe, it, expect } from "vitest";
import { agoLabel, untilLabel } from "./relativeTime";

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe("agoLabel", () => {
  it("reads 'just now' under 45 seconds and for skewed (negative) ages", () => {
    expect(agoLabel(0)).toBe("just now");
    expect(agoLabel(44 * S)).toBe("just now");
    expect(agoLabel(-5 * S)).toBe("just now");
  });
  it("crosses to minutes at 45s and reports whole minutes", () => {
    expect(agoLabel(45 * S)).toBe("1m ago");
    expect(agoLabel(5 * M)).toBe("5m ago");
    expect(agoLabel(59 * M)).toBe("59m ago");
  });
  it("reports hours then days", () => {
    expect(agoLabel(1 * H)).toBe("1h ago");
    expect(agoLabel(23 * H)).toBe("23h ago");
    expect(agoLabel(1 * D)).toBe("1d ago");
    expect(agoLabel(3 * D)).toBe("3d ago");
  });
});

describe("untilLabel", () => {
  it("clamps zero and past to 'now'", () => {
    expect(untilLabel(0)).toBe("now");
    expect(untilLabel(-10 * S)).toBe("now");
  });
  it("shows seconds only in the final minute", () => {
    expect(untilLabel(45 * S)).toBe("45s");
    expect(untilLabel(1 * S)).toBe("1s");
  });
  it("shows minutes under an hour", () => {
    expect(untilLabel(12 * M)).toBe("12m");
    expect(untilLabel(59 * M + 59 * S)).toBe("59m");
  });
  it("shows hours and minutes at an hour or more", () => {
    expect(untilLabel(1 * H)).toBe("1h 0m");
    expect(untilLabel(1 * H + 49 * M)).toBe("1h 49m");
    expect(untilLabel(2 * H + 5 * M + 30 * S)).toBe("2h 5m");
  });
});
