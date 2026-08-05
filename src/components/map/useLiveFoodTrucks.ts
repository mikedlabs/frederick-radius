"use client";

// Live food-truck pins for the map (#77 extraction from AppMap.tsx).
// Owns the public poll of /api/food-trucks/live plus the minute clock that
// ages pins out as their windows close. Behavior is byte-identical to the
// inline original; the peek-pruning effect stays in AppMap because it
// touches selection state.

import { useEffect, useMemo, useState } from "react";
import { activeFoodTruckPins } from "./foodTruckPins";
import type { FoodTruckMapPin } from "./types";

export function useLiveFoodTrucks(
  foodTruckPins: FoodTruckMapPin[],
  isBrowseMap: boolean,
): FoodTruckMapPin[] {
  const [currentFoodTruckPins, setCurrentFoodTruckPins] = useState(foodTruckPins);
  const [foodTruckClock, setFoodTruckClock] = useState(() => Date.now());
  // Prop sync predates this extraction (AppMap ran the same line; its size
  // bailed the compiler lint there). Kept byte-identical — the refactor's
  // contract is zero behavior change; revisit as a render-phase reset later.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCurrentFoodTruckPins(foodTruckPins), [foodTruckPins]);
  useEffect(() => {
    // Only the full browse map needs a minute-by-minute public read. Embeds do
    // not poll unless they were explicitly given a live pin.
    if (!isBrowseMap && foodTruckPins.length === 0) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/food-trucks/live", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { pins?: FoodTruckMapPin[] };
        if (active && Array.isArray(body.pins)) setCurrentFoodTruckPins(body.pins);
      } catch {
        // Keep the server-provided snapshot. Live pins are an enhancement;
        // a temporary read failure must never disturb the rest of the map.
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
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
