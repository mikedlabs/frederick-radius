import { describe, expect, it } from "vitest";
import {
  civicAlertPriority,
  powerOutageDisplay,
  powerOutageTone,
  pulseAqiPriority,
  pulseAlertPriority,
  pulseStatusState,
  selectPulseLeadCandidate,
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

  it("keeps a City emergency and severe rescue ahead of routine live signals", () => {
    const city = {
      id: "city",
      family: "civic" as const,
      priority: civicAlertPriority("city-emergency"),
      reason: "official City emergency",
      observedAt: "2026-08-01T12:00:00.000Z",
    };
    const rescue = {
      id: "rescue",
      family: "fire-rescue" as const,
      priority: 2,
      reason: "severe rescue dispatch",
      observedAt: "2026-08-01T12:05:00.000Z",
    };
    const routine = [
      {
        id: "air",
        family: "air" as const,
        priority: pulseAqiPriority(3),
        reason: "AQI unhealthy for sensitive groups",
      },
      {
        id: "power",
        family: "power" as const,
        priority: 8,
        reason: "localized outage",
      },
      {
        id: "road",
        family: "traffic" as const,
        priority: 7,
        reason: "road advisory",
      },
    ];

    expect(selectPulseLeadCandidate([...routine, rescue])?.id).toBe("rescue");
    expect(selectPulseLeadCandidate([...routine, rescue, city])).toMatchObject({
      id: "city",
      reason: "official City emergency",
    });
  });

  it("lets an explicit extreme-weather override outrank other sources", () => {
    expect(
      selectPulseLeadCandidate([
        {
          id: "city",
          family: "civic",
          priority: civicAlertPriority("city-emergency"),
          reason: "official City emergency",
        },
        {
          id: "tornado",
          family: "weather",
          priority: pulseAlertPriority(alert({
            event: "Tornado Warning",
            severity: "Extreme",
          })),
          reason: "NWS immediate warning",
        },
      ]),
    ).toMatchObject({ id: "tornado", priority: 0 });
  });

  it("uses source family and recency only after consequence", () => {
    expect(
      selectPulseLeadCandidate([
        {
          id: "older-weather",
          family: "weather",
          priority: 6,
          reason: "weather advisory",
          observedAt: "2026-08-01T11:00:00.000Z",
        },
        {
          id: "newer-road",
          family: "traffic",
          priority: 6,
          reason: "road warning",
          observedAt: "2026-08-01T12:00:00.000Z",
        },
      ])?.id,
    ).toBe("older-weather");
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

describe("powerOutageDisplay", () => {
  it("labels a sub-threshold nonzero outage honestly", () => {
    expect(powerOutageDisplay(23, true)).toEqual({
      countLabel: "23 reported",
      unit: "customers out",
      quietDetail:
        "23 customers are reported without power, below Radius's major-outage threshold.",
    });
  });

  it("reserves all served for a real zero", () => {
    expect(powerOutageDisplay(0, true).unit).toBe("all served");
    expect(powerOutageDisplay(1, true)).toEqual({
      countLabel: "1 reported",
      unit: "customer out",
      quietDetail:
        "1 customer is reported without power, below Radius's major-outage threshold.",
    });
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
