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
});
