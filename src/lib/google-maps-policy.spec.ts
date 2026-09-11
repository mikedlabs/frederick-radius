import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_MAPS_WRITTEN_APPROVAL_VALUE,
  googleHoursRefreshRuntimeEnabled,
  googleMapsPlatformRuntimeEnabled,
  googleMapsWrittenApprovalConfirmed,
  googleRoutesRuntimeEnabled,
} from "./google-maps-policy";

afterEach(() => vi.unstubAllEnvs());

describe("Google Maps Platform policy hold", () => {
  it("fails closed when keys or feature switches exist without written approval", () => {
    vi.stubEnv("GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED", "1");
    vi.stubEnv("GOOGLE_ROUTES_ENABLED", "1");

    expect(googleMapsWrittenApprovalConfirmed()).toBe(false);
    expect(googleMapsPlatformRuntimeEnabled()).toBe(false);
    expect(googleHoursRefreshRuntimeEnabled()).toBe(false);
    expect(googleRoutesRuntimeEnabled()).toBe(false);
  });

  it("requires the exact approval value and both runtime switches", () => {
    vi.stubEnv(
      "GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL",
      GOOGLE_MAPS_WRITTEN_APPROVAL_VALUE,
    );
    vi.stubEnv("GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED", "1");
    vi.stubEnv("HOURS_REFRESH_CRON", "0");

    expect(googleMapsWrittenApprovalConfirmed()).toBe(true);
    expect(googleMapsPlatformRuntimeEnabled()).toBe(true);
    expect(googleHoursRefreshRuntimeEnabled()).toBe(false);
    expect(googleRoutesRuntimeEnabled()).toBe(false);

    vi.stubEnv("GOOGLE_ROUTES_ENABLED", "1");
    expect(googleRoutesRuntimeEnabled()).toBe(true);

    vi.stubEnv("HOURS_REFRESH_CRON", "1");
    expect(googleHoursRefreshRuntimeEnabled()).toBe(true);
  });
});
