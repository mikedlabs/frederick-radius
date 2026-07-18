import { describe, expect, it } from "vitest";
import { pulseAlertPriority, shouldAqiLead, type PulseAlertSignal } from "./signal-priority";

function alert(overrides: Partial<PulseAlertSignal> = {}): PulseAlertSignal {
  return {
    event: "Special Weather Statement",
    headline: "Special Weather Statement",
    description: "Routine statement.",
    severity: "Unknown",
    ...overrides,
  };
}

describe("Pulse safety signal priority", () => {
  it("ranks immediate warnings above routine statements", () => {
    expect(pulseAlertPriority(alert({
      event: "Tornado Warning",
      headline: "Tornado Warning",
      severity: "Extreme",
    }))).toBeLessThan(pulseAlertPriority(alert()));
  });

  it("lets Hazardous and Very Unhealthy AQI lead routine advisories", () => {
    expect(shouldAqiLead(6, alert())).toBe(true);
    expect(shouldAqiLead(5, alert({ event: "Wind Advisory" }))).toBe(true);
  });

  it("never lets AQI displace a tornado warning", () => {
    const tornado = alert({
      event: "Tornado Warning",
      headline: "Tornado Warning",
      severity: "Extreme",
    });
    expect(shouldAqiLead(6, tornado)).toBe(false);
  });

  it("ranks the issued Code Orange level instead of Purple timing text later in the bulletin", () => {
    const codeOrange = alert({
      event: "Air Quality Alert",
      description: `MDE has issued a Code Orange Air Quality Alert Saturday.
Smoke may be unhealthy (Red Alert) to very unhealthy (Purple Alert) Friday night into Saturday morning.`,
    });
    const tornado = alert({ event: "Tornado Warning", headline: "Tornado Warning", severity: "Extreme" });

    expect(pulseAlertPriority(codeOrange)).toBe(6);
    expect(pulseAlertPriority(tornado)).toBeLessThan(pulseAlertPriority(codeOrange));
    expect(shouldAqiLead(5, codeOrange)).toBe(true);
  });
});
