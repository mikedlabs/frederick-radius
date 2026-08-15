"use client";

// Live food-truck pins for the map (#77 extraction from AppMap.tsx).
// Owns the public poll of /api/food-trucks/live plus the minute clock that
// ages pins out as their windows close. Behavior is byte-identical to the
// inline original; the peek-pruning effect stays in AppMap because it
// touches selection state.

import { useEffect, useMemo, useState } from "react";
import { activeFoodTruckPins } from "./foodTruckPins";
import type { FoodTruckMapPin } from "./types";

const ACTIVE_POLL_MS = 60_000;
const IDLE_POLL_MS = 5 * 60_000;

/** Keep the client inside the server's bounded polling contract. A malformed
 * or missing hint can never turn an idle map into a tight request loop. */
export function liveFoodTruckPollDelay(
  pinCount: number,
  suggestedMs?: number,
): number {
  const fallback = pinCount > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS;
  return Number.isFinite(suggestedMs)
    && suggestedMs! >= ACTIVE_POLL_MS
    && suggestedMs! <= IDLE_POLL_MS
    ? suggestedMs!
    : fallback;
}

export function useLiveFoodTrucks(
  foodTruckPins: FoodTruckMapPin[],
  isBrowseMap: boolean,
): FoodTruckMapPin[] {
  const [currentFoodTruckPins, setCurrentFoodTruckPins] = useState(foodTruckPins);
  const [foodTruckClock, setFoodTruckClock] = useState(() => Date.now());
  // Prop sync predates this extraction (AppMap ran the same line; its size
  // bailed the compiler lint there). Kept byte-identical — the refactor's
  // contract is zero behavior change; revisit as a render-phase reset later.
  useEffect(() => setCurrentFoodTruckPins(foodTruckPins), [foodTruckPins]);
  useEffect(() => {
    // Only the full browse map needs a public read. Embeds do not poll unless
    // they were explicitly given a live pin. Empty layers back off to the
    // server-provided idle interval instead of querying the database every
    // minute for the whole time a map tab is open.
    if (!isBrowseMap && foodTruckPins.length === 0) return;
    let active = true;
    let timer: number | null = null;
    let controller: AbortController | null = null;

    const schedule = (delayMs: number) => {
      if (timer !== null) window.clearTimeout(timer);
      if (!active || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => void refresh(), delayMs);
    };

    const refresh = async () => {
      if (!active || document.visibilityState !== "visible") return;
      controller?.abort();
      controller = new AbortController();
      let nextPollAfterMs = IDLE_POLL_MS;
      try {
        const response = await fetch("/api/food-trucks/live", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as {
          pins?: FoodTruckMapPin[];
          nextPollAfterMs?: number;
        };
        if (active && Array.isArray(body.pins)) {
          setCurrentFoodTruckPins(body.pins);
          nextPollAfterMs = liveFoodTruckPollDelay(
            body.pins.length,
            body.nextPollAfterMs,
          );
        }
      } catch {
        // Keep the server-provided snapshot. Live pins are an enhancement;
        // a temporary read failure must never disturb the rest of the map.
      } finally {
        schedule(nextPollAfterMs);
      }
    };

    if (document.visibilityState === "visible") void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      } else if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
        controller?.abort();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  // BrowseMapClient rebuilds its descriptive `dock` object when shareable URL
  // state changes. Depend on its stable presence, not object identity, or each
  // camera/query URL update restarts this poll and can create a request loop.
  }, [foodTruckPins.length, isBrowseMap]);
  useEffect(() => {
    if (currentFoodTruckPins.length === 0) return;
    const timer = window.setInterval(() => setFoodTruckClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [currentFoodTruckPins.length]);
  return useMemo(
    () => activeFoodTruckPins(currentFoodTruckPins, foodTruckClock),
    [currentFoodTruckPins, foodTruckClock],
  );
}
