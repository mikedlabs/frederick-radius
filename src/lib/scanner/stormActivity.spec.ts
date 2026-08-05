import { describe, expect, it } from "vitest";
import { stormActivityLine } from "./stormActivity";

const now = new Date("2026-08-05T02:00:00.000Z");
const min = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();

describe("stormActivityLine", () => {
  it("counts the hazard's kinds inside the window and says them plainly", () => {
    const line = stormActivityLine(
      [
        { kind: "Wires down", at: min(10) },
        { kind: "Wires down", at: min(45) },
        { kind: "Flooding", at: min(100) },
        { kind: "Crash", at: min(5) }, // not a storm kind
      ],
      "storm",
      now,
    );
    expect(line).toBe(
      "On the scanner in the last 3 hours: 2 wires-down calls and 1 flooding call.",
    );
  });

  it("ages calls out of the window and future timestamps never count", () => {
    const line = stormActivityLine(
      [
        { kind: "Wires down", at: min(200) },
        { kind: "Wires down", at: min(-5) },
      ],
      "storm",
      now,
    );
    expect(line).toBeNull();
  });

  it("stays silent for hazards the public kinds carry no signal for", () => {
    const calls = [{ kind: "Wires down" as const, at: min(10) }];
    expect(stormActivityLine(calls, "heat", now)).toBeNull();
    expect(stormActivityLine(calls, "cold", now)).toBeNull();
  });

  it("speaks flood language during a flood", () => {
    const line = stormActivityLine(
      [
        { kind: "Flooding", at: min(30) },
        { kind: "Water rescue", at: min(20) },
        { kind: "Wires down", at: min(10) }, // not a flood kind
      ],
      "flood",
      now,
    );
    expect(line).toBe(
      "On the scanner in the last 3 hours: 1 flooding call and 1 water-rescue call.",
    );
  });
});
