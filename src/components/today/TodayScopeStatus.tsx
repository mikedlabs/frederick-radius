"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { commitLocationScope } from "@/components/nav/locationScopeNavigation";
import { readCachedPosition, useGeolocation } from "@/hooks/useGeolocation";
import {
  getScope,
  parseScope,
  scopeInSentence,
  scopeLabel,
  scopeTownSlug,
  setScope,
  subscribeScopeChange,
  type Scope,
} from "@/lib/scope";
import { MUNICIPALITIES } from "@/data/municipalities";

/** Plain-language contract for Today's mixed scope. Place decisions honor the
 * shared lens; weather, alerts, and the event program stay on the whole
 * county, and the readout says so with the same area names as the header. */
export function todayScopeStatusText(
  scope: Scope | null,
  hasDeviceLocation = true,
): string {
  const wholeCounty = scopeInSentence(scopeLabel("county"));
  if (scopeTownSlug(scope)) return `${scopeLabel(scope)} picks · Weather for ${wholeCounty}`;
  if (scope === "nearme") {
    return hasDeviceLocation
      ? `${scopeLabel("nearme")} picks · Weather and events for ${wholeCounty}`
      : `${scopeLabel("nearme")} needs your location · Weather and events for ${wholeCounty}`;
  }
  return `${scopeLabel("county")} briefing`;
}

const subscribeReady = () => () => {};

const subscribe = (onStoreChange: () => void) =>
  subscribeScopeChange(() => onStoreChange());

/**
 * Keep Today's mixed scope explicit. The compact arrival puts its calendar date
 * in the masthead and leaves county/town selection and location opt-in here.
 * Town and Near me readouts never imply that fixed-center weather or county
 * events have been filtered to that place.
 */
export default function TodayScopeStatus({ dateline, density = "standard" }: {
  dateline?: string;
  density?: "standard" | "compact";
}) {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const storedScope = useSyncExternalStore(subscribe, getScope, () => null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlScope = parseScope(searchParams.get("in"));
  const scope = urlScope ?? storedScope;
  // Today is a cached briefing; the shared writer changes its area through
  // native history, which keeps Next's search-parameter readers in sync.
  const applyTodayScope = useCallback(
    (next: Scope) => commitLocationScope(next, router),
    [router],
  );

  // An explicit inbound URL wins over yesterday's saved area. Align the shared
  // store once per URL change so the place choices use the same lens as this
  // readout. Tab memory never replays an old area here (primary-tab-session).
  // Visitor choices update both together through the shared writer.
  useEffect(() => {
    if (urlScope && getScope() !== urlScope) setScope(urlScope);
  }, [urlScope]);
  const townScoped = Boolean(scopeTownSlug(scope));
  // The native picker already names Whole county. Keep that redundant live
  // status accessible without adding a second visible row on ordinary arrival.
  // A selected town or unresolved Near me still needs its full scope warning.
  const compactCounty = density === "compact" && !townScoped && scope !== "nearme";
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
    applyTodayScope("nearme");
  }, [applyTodayScope, location.status]);

  const useMyLocation = () => {
    if (hasDeviceLocation) {
      applyTodayScope("nearme");
      return;
    }
    requestedHere.current = true;
    requestLocation();
  };

  return (
    <div data-today-scope-density={density} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="today-scope-status"
        className={compactCounty ? "sr-only" : "flex w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] leading-normal"}
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
      <label className="inline-flex min-h-11 max-w-full items-center gap-2 text-[13px] font-medium">
        <span className="sr-only">Choose your area</span>
        <select
          disabled={!ready}
          value={scope ?? "county"}
          onChange={(event) => applyTodayScope(event.target.value as Scope)}
          className="min-h-11 max-w-full rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated)] px-3 text-[16px]"
          style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
        >
          <option value="county">Whole county</option>
          {scope === "nearme" && <option value="nearme">Near me</option>}
          {MUNICIPALITIES.map((town) => <option key={town.slug} value={`town:${town.slug}`}>{town.name}</option>)}
        </select>
      </label>
      {showLocationAction ? (
        locationBlocked ? (
          // A denial cannot be re-prompted in this page session, so keeping
          // the button would make every tap a dead "Finding you…" call. Name
          // the cause and point at the browser's own site setting, the only
          // place the permission can be turned back on. The 8s timeout
          // ("error") keeps the button because a retry there can succeed.
          <p
            data-testid="today-location-blocked"
            className="max-w-[30ch] text-[12px] leading-normal"
            style={{ color: "var(--app-ink-3)" }}
          >
            {location.status === "denied"
              ? "Location is off. Choose a town to keep browsing."
              : "Location is unavailable. Choose a town to keep browsing."}
          </p>
        ) : (
          <button
            type="button"
            onClick={useMyLocation}
            disabled={location.status === "loading"}
            className="tap-44 inline-flex h-11 shrink-0 items-center px-0 text-[14px] font-semibold underline decoration-1 underline-offset-4 transition disabled:opacity-55"
            style={{
              color: "var(--app-link)",
              textDecorationColor: "var(--app-brand-tint-22)",
            }}
          >
            {location.status === "loading" ? "Finding you…" : "Use my location"}
          </button>
        )
      ) : null}
    </div>
  );
}
