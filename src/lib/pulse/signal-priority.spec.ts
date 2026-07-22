import { describe, expect, it } from "vitest";
import {
  powerOutageTone,
  pulseAlertPriority,
  pulseStatusState,
  shouldAqiLead,
  type PulseAlertSignal,
  type PulseStatusSignals,
} from "./signal-priority";

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

describe("powerOutageTone", () => {
  it("keeps a small active outage visible without labeling it high severity", () => {
    expect(powerOutageTone(25, 119_844)).toBe("warning");
  });

  it("marks a widespread outage as high severity", () => {
    expect(powerOutageTone(1_000, 119_844)).toBe("danger");
    expect(powerOutageTone(250, 20_000)).toBe("danger");
  });
});

describe("pulseStatusState", () => {
  const quiet: PulseStatusSignals = {
    weather: false,
    fireRescue: false,
    traffic: false,
    power: false,
    schools: false,
    air: false,
    police: false,
  };

  it("never reports all clear while a breaking police release is active", () => {
    expect(pulseStatusState({ ...quiet, police: true }, false)).toEqual({
      hasActive: true,
      heroDegraded: false,
      allClear: false,
    });
  });

  it("keeps the quiet and degraded states distinct", () => {
    expect(pulseStatusState(quiet, false).allClear).toBe(true);
    expect(pulseStatusState(quiet, true)).toEqual({
      hasActive: false,
      heroDegraded: true,
      allClear: false,
    });
  });
});
