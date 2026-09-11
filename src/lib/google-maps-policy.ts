/**
 * Code-level hold for Google Maps Platform calls.
 *
 * Radius currently uses non-Google maps and has durable Google-derived place
 * snapshots. A key being present is therefore not enough authority to call a
 * Google Maps Platform API. Operators must explicitly record that written
 * authorization has been reviewed, then enable the relevant runtime switch.
 * This is a conservative technical guard, not a legal determination.
 */
export const GOOGLE_MAPS_WRITTEN_APPROVAL_VALUE =
  "written-google-authorization-confirmed";
export const GOOGLE_HOURS_POLICY_HOLD_MESSAGE =
  "Paid Google hours refresh is intentionally disabled. Current-hours coverage remains unavailable until an approved replacement source is promoted.";

export function googleMapsWrittenApprovalConfirmed(): boolean {
  return (
    process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL?.trim() ===
    GOOGLE_MAPS_WRITTEN_APPROVAL_VALUE
  );
}

export function googleMapsPlatformRuntimeEnabled(): boolean {
  return (
    googleMapsWrittenApprovalConfirmed() &&
    process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED === "1"
  );
}

export function googleHoursRefreshRuntimeEnabled(): boolean {
  return (
    googleMapsPlatformRuntimeEnabled() &&
    process.env.HOURS_REFRESH_CRON === "1"
  );
}

export function googleRoutesRuntimeEnabled(): boolean {
  return (
    googleMapsPlatformRuntimeEnabled() &&
    process.env.GOOGLE_ROUTES_ENABLED === "1"
  );
}
