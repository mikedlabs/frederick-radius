"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { readCachedPosition, useGeolocation } from "@/hooks/useGeolocation";
import {
  getScope,
  scopeTownSlug,
  setScope,
  subscribeScopeChange,
  type Scope,
} from "@/lib/scope";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/** Plain-language contract for Today's mixed scope. Place decisions honor the
 * shared lens; weather, alerts, and the event program remain countywide. */
export function todayScopeStatusText(
  scope: Scope | null,
  hasDeviceLocation = true,
): string {
  const townSlug = scopeTownSlug(scope);
  const town = townSlug ? MUNICIPALITY_BY_SLUG[townSlug] : null;
  if (town) return `${town.name} place picks · Countywide weather and events`;
  if (scope === "nearme") {
    return hasDeviceLocation
      ? "Nearby place picks · Countywide weather and events"
      : "Location needed for nearby picks · Countywide weather and events";
  }
  return "Countywide briefing";
}

const subscribe = (onStoreChange: () => void) =>
  subscribeScopeChange(() => onStoreChange());

/**
 * The LocationChip intentionally hides its text below 390px. Keep the active
 * lens visible in the page itself and announce changes without pretending the
 * fixed-center weather or county event program is filtered to one town.
 *
 * `dateline` carries the calendar date as this line's first segment. It used
 * to be its own decorated eyebrow ABOVE the h1 (brick dash + uppercase),
 * which meant two supporting rows bracketed the title and the largest thing
 * in the masthead was still smaller than the section headings below it. One
 * quiet line under the title now holds both supporting facts.
 */
export default function TodayScopeStatus({ dateline }: { dateline?: string }) {
  const scope = useSyncExternalStore(subscribe, getScope, () => null);
  const townScoped = Boolean(scopeTownSlug(scope));
  const {
    state: location,
    request: requestLocation,
    requestIfGranted,
  } = useGeolocation();
  const requestedHere = useRef(false);
  const grantedCheckDone = useRef(false);
  const hasDeviceLocation = location.status === "granted";
  const locationBlocked =
    location.status === "denied" || location.status === "unavailable";
  const showLocationAction =
    !townScoped && (scope !== "nearme" || !hasDeviceLocation);

  // A returning Near me visitor whose browser already granted geolocation
  // should not read "Location needed" over a button for a permission they
  // gave. Refresh the fix silently, matching the map's and Ask's
  // returning-visitor contract: requestIfGranted() asks the Permissions API
  // first and stands down unless the state is already "granted", so a user
  // who never granted is never prompted. County and town lenses stay fully
  // opt-in.
  useEffect(() => {
    if (scope !== "nearme" || grantedCheckDone.current) return;
    if (readCachedPosition()) return;
    grantedCheckDone.current = true;
    void requestIfGranted();
  }, [scope, requestIfGranted]);

  useEffect(() => {
    if (!requestedHere.current || location.status !== "granted") return;
    requestedHere.current = false;
    setScope("nearme");
  }, [location.status]);

  const useMyLocation = () => {
    if (hasDeviceLocation) {
      setScope("nearme");
      return;
    }
    requestedHere.current = true;
    requestLocation();
  };

  return (
    <div className="mt-1.5 flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="today-scope-status"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10.5px] leading-snug tracking-[0.02em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        {dateline && (
          <>
            <span style={{ color: "var(--app-ink-2)" }}>{dateline}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: townScoped ? "var(--app-brand)" : "var(--app-cool)",
          }}
        />
        {todayScopeStatusText(scope, hasDeviceLocation)}
      </p>
      {showLocationAction ? (
        locationBlocked ? (
          // A denial cannot be re-prompted in this page session, so keeping
          // the button would make every tap a dead "Finding you…" call. Name
          // the cause and point at the browser's own site setting, the only
          // place the permission can be turned back on. The 8s timeout
          // ("error") keeps the button because a retry there can succeed.
          <p
            data-testid="today-location-blocked"
            className="max-w-[36ch] text-right text-[10.5px] leading-snug"
            style={{ color: "var(--app-ink-3)" }}
          >
            {location.status === "denied"
              ? "Location is off for this site. Turn it on in your browser settings to see nearby picks."
              : "Location is unavailable on this device."}
          </p>
        ) : (
          <button
            type="button"
            onClick={useMyLocation}
            disabled={location.status === "loading"}
            className="tap-44 inline-flex h-11 shrink-0 items-center rounded-full px-2.5 text-[10.5px] font-semibold transition active:scale-[0.98] disabled:opacity-55"
            style={{
              color: "var(--app-brand-press)",
              background: "var(--app-brand-tint-6)",
            }}
          >
            {location.status === "loading" ? "Finding you…" : "Use my location"}
          </button>
        )
      ) : null}
    </div>
  );
}
