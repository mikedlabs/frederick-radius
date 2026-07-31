import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPulsePointIncidents,
  getPulsePointIncidentsResult,
  pulsePointCallProfile,
} from "@/lib/integrations/pulsepoint";

const originalAgency = process.env.PULSEPOINT_AGENCY_ID;
const originalEnabled = process.env.PULSEPOINT_ENABLED;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalAgency === undefined) delete process.env.PULSEPOINT_AGENCY_ID;
  else process.env.PULSEPOINT_AGENCY_ID = originalAgency;
  if (originalEnabled === undefined) delete process.env.PULSEPOINT_ENABLED;
  else process.env.PULSEPOINT_ENABLED = originalEnabled;
});

describe("PulsePoint availability", () => {
  it("distinguishes an unconfigured feed from a quiet feed", async () => {
    delete process.env.PULSEPOINT_AGENCY_ID;
    process.env.PULSEPOINT_ENABLED = "1";

    await expect(getPulsePointIncidentsResult()).resolves.toEqual({
      data: [],
      available: false,
      configured: false,
    });
  });

  it("does not fetch when an agency id exists without explicit policy approval", async () => {
    process.env.PULSEPOINT_AGENCY_ID = "test-agency";
    delete process.env.PULSEPOINT_ENABLED;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPulsePointIncidentsResult()).resolves.toEqual({
      data: [],
      available: false,
      configured: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not turn an upstream failure into a false all-clear", async () => {
    process.env.PULSEPOINT_AGENCY_ID = "test-agency";
    process.env.PULSEPOINT_ENABLED = "1";
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPulsePointIncidentsResult()).resolves.toEqual({
      data: [],
      available: false,
      configured: true,
    });
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the incident-array compatibility wrapper fail-soft", async () => {
    process.env.PULSEPOINT_AGENCY_ID = "test-agency";
    process.env.PULSEPOINT_ENABLED = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ message: "upstream schema changed" }),
      ),
    );

    await expect(getPulsePointIncidents()).resolves.toEqual([]);
  });
});

describe("PulsePoint call severity", () => {
  it("keeps routine service calls informational", () => {
    expect(pulsePointCallProfile("PA")).toEqual({
      label: "Public Assist",
      severity: "routine",
    });
    expect(pulsePointCallProfile("LO")).toEqual({
      label: "Lockout",
      severity: "routine",
    });
    expect(pulsePointCallProfile("FA")).toEqual({
      label: "Fire Alarm",
      severity: "routine",
    });
  });

  it("distinguishes visible activity from severe public hazards", () => {
    expect(pulsePointCallProfile("WIRE")).toEqual({
      label: "Wires Down",
      severity: "notable",
    });
    expect(pulsePointCallProfile("ST")).toEqual({
      label: "Structure Fire",
      severity: "severe",
    });
    expect(pulsePointCallProfile("HMR")).toEqual({
      label: "Hazmat",
      severity: "severe",
    });
  });

  it("continues to reject unknown or medical call codes", () => {
    expect(pulsePointCallProfile("MED")).toBeNull();
    expect(pulsePointCallProfile("")).toBeNull();
  });
});
