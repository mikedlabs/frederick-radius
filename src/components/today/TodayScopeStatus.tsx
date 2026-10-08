"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { locationScopeHref } from "@/components/nav/locationScopeNavigation";
import {
  readCachedPosition,
  useGeolocation,
  type GeoState,
} from "@/hooks/useGeolocation";
import {
  getScope,
  NEAR_ME_BENEFIT,
  parseScope,
  scopeLabel,
  scopeTownSlug,
  setScope,
  subscribeScopeChange,
  type Scope,
} from "@/lib/scope";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

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

/** Today is a cached briefing; changing its client scope needs no server fetch.
 * Native history also synchronizes Next's search-parameter readers, including
 * the Tonight entry, while preserving unrelated query and hash state. */
function applyTodayScope(scope: Scope) {
  setScope(scope);
  const href = locationScopeHref(window.location.href, scope);
  if (href) window.history.replaceState(null, "", href);
}

const subscribeReady = () => () => {};

const subscribe = (onStoreChange: () => void) =>
  subscribeScopeChange(() => onStoreChange());

/**
 * Today's one area line: the native area select set as text, a chevron, and a
 * plain readout of what that area changes. TopBar keeps the LocationChip off
 * /today, so this line is the page's scope control (owner question, October
 * 2026: keep one in-page control for now). It replaced a bordered select and
 * an always-visible "Use my location" pill, about 60px of the first screen.
 *
 * Near me is always listed. Choosing it without a device fix never calls
 * geolocation: the area in effect stays in effect, the readout keeps naming
 * it, and one sentence explains what location is for, with one "Use my
 * location" button under it. Only that button can open the browser's prompt
 * (USER_FIRST_INTERACTION_CONTRACT), and a grant applies Near me through the
 * same applyTodayScope as every other choice.
 */
export default function TodayScopeStatus() {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const storedScope = useSyncExternalStore(subscribe, getScope, () => null);
  const searchParams = useSearchParams();
  const urlScope = parseScope(searchParams.get("in"));
  const scope = urlScope ?? storedScope;

  // An explicit shared URL wins over yesterday's saved area. Align the shared
  // store once per URL change so the place choices use the same lens as this
  // readout. Area changes update both together through applyTodayScope.
  useEffect(() => {
    if (urlScope && getScope() !== urlScope) setScope(urlScope);
  }, [urlScope]);
  const {
    state: location,
    request: requestLocation,
    requestIfGranted,
  } = useGeolocation();
  const requestedHere = useRef(false);
  const grantedCheckDone = useRef(false);
  const benefitId = useId();
  // Near me was chosen from the select while this device had no fix.
  const [askedForNearMe, setAskedForNearMe] = useState(false);
  // The select shows Near me before Near me is in effect. Chrome and Edge on
  // Windows, Linux and ChromeOS, and NVDA or JAWS in focus mode, step a closed
  // select one option per arrow key and fire change on each step. Snapping the
  // select back to the area in effect would stop every ArrowDown from the
  // county at Near me, so no town past it could be reached. The readout and
  // the place picks keep following `scope`.
  //
  // This holds the location status under which Near me was chosen, and any
  // change of status ends the hold: a fix applies Near me through `scope`, and
  // a refusal or failure leaves the area in effect showing. Focus leaving this
  // line, or another choice, ends it too.
  const [nearMeHeldWhile, setNearMeHeldWhile] = useState<
    GeoState["status"] | null
  >(null);
  const hasDeviceLocation = location.status === "granted";
  const shownArea: Scope =
    nearMeHeldWhile !== null && nearMeHeldWhile === location.status
      ? "nearme"
      : (scope ?? "county");
  const locationBlocked =
    location.status === "denied" || location.status === "unavailable";
  // A returning Near me visitor without a fix needs the same explanation as
  // someone choosing Near me now.
  const needsLocation =
    ready && !hasDeviceLocation && (askedForNearMe || scope === "nearme");

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
  }, [location.status]);

  const chooseArea = (value: Scope) => {
    if (value === "nearme" && !hasDeviceLocation) {
      setAskedForNearMe(true);
      setNearMeHeldWhile(location.status);
      return;
    }
    setAskedForNearMe(false);
    setNearMeHeldWhile(null);
    applyTodayScope(value);
  };

  const useMyLocation = () => {
    requestedHere.current = true;
    // The request keeps Near me showing until it settles, so a grant does not
    // flicker through the county on its way to Near me.
    if (nearMeHeldWhile !== null) setNearMeHeldWhile("loading");
    requestLocation();
  };

  return (
    <div
      onBlur={(event) => {
        // Moving from the select to the location button keeps Near me showing,
        // because that button is how the choice is finished.
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setNearMeHeldWhile(null);
      }}
    >
      {/* The readout wraps inside its own column, so a long town readout
          never strands the separator at the end of a line. */}
      <div className="flex min-h-11 items-center gap-x-1.5">
        <label className="relative inline-flex min-h-11 shrink-0 items-center">
          <span className="sr-only">Choose your area</span>
          {/* 16px text keeps iOS from zooming the page when the select takes
              focus. field-sizing fits the select to the area it shows, so the
              chevron sits beside the words where the browser supports it. */}
          <select
            disabled={!ready}
            value={shownArea}
            onChange={(event) => chooseArea(event.target.value as Scope)}
            className="text-body-lg field-sizing-content min-h-11 min-w-11 cursor-pointer appearance-none rounded-[var(--app-radius-sm)] border-0 bg-transparent py-0 pl-0 pr-6 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] disabled:cursor-default"
            style={{ color: "var(--app-ink)" }}
          >
            <option value="county">{scopeLabel("county")}</option>
            <option value="nearme">{scopeLabel("nearme")}</option>
            {MUNICIPALITIES.map((town) => <option key={town.slug} value={`town:${town.slug}`}>{town.name}</option>)}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-0.5 h-4 w-4"
            style={{ color: "var(--app-ink-2)" }}
          />
        </label>
        <span aria-hidden className="text-meta-lg shrink-0" style={{ color: "var(--app-ink-3)" }}>
          ·
        </span>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="today-scope-status"
          className="text-meta-lg min-w-0 flex-1"
          style={{ color: "var(--app-ink-3)" }}
        >
          {todayScopeStatusText(scope, hasDeviceLocation)}
        </p>
      </div>
      {/* The live region stays mounted so a screen reader hears the sentence
          that answers a Near me choice the select has not applied yet. */}
      <div aria-live="polite">
        {needsLocation ? (
          locationBlocked ? (
            // A denial cannot be re-prompted in this page session, so a button
            // would make every tap a dead "Finding you…" call. Name the cause
            // and point at the towns, which need no permission. The 8s timeout
            // ("error") keeps the button because a retry there can succeed.
            <p
              data-testid="today-location-blocked"
              className="text-meta-lg max-w-[40ch] pb-1"
              style={{ color: "var(--app-ink-3)" }}
            >
              {location.status === "denied"
                ? "Location is off. Choose a town to keep browsing."
                : "Location is unavailable. Choose a town to keep browsing."}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3">
              <p
                id={benefitId}
                data-testid="today-location-benefit"
                className="text-meta-lg max-w-[44ch]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {NEAR_ME_BENEFIT}
              </p>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={location.status === "loading"}
                aria-describedby={benefitId}
                className="text-meta-lg inline-flex min-h-11 shrink-0 items-center rounded-[var(--app-radius-sm)] font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] disabled:opacity-55"
                style={{ color: "var(--app-brand-press)" }}
              >
                {location.status === "loading" ? "Finding you…" : "Use my location"}
              </button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
