"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CalendarDays, MapPin, Store } from "lucide-react";

export type FoodTruckJourneyMode = "near" | "week" | "trucks";

const MODES: ReadonlyArray<{
  id: FoodTruckJourneyMode;
  label: string;
  hash: string;
  icon: typeof MapPin;
}> = [
  { id: "near", label: "Near me", hash: "near-me", icon: MapPin },
  { id: "week", label: "This week", hash: "this-week", icon: CalendarDays },
  { id: "trucks", label: "Trucks", hash: "vendors", icon: Store },
];

/** Keep existing shared links useful after the page becomes a tabbed journey. */
export function modeForFoodTruckHash(
  hash: string,
  fallback: FoodTruckJourneyMode = "week",
): FoodTruckJourneyMode {
  const normalized = hash.replace(/^#/, "").toLocaleLowerCase();
  if (normalized === "near-me") return "near";
  if (normalized === "this-week") return "week";
  if (normalized === "vendors" || normalized.startsWith("truck-")) return "trucks";
  return fallback;
}

export default function FoodTruckJourneys({
  nearby,
  week,
  trucks,
  defaultMode = "week",
}: {
  nearby: ReactNode;
  week: ReactNode;
  trucks: ReactNode;
  defaultMode?: FoodTruckJourneyMode;
}) {
  const [mode, setMode] = useState<FoodTruckJourneyMode>(defaultMode);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const syncHash = () => {
      const next = modeForFoodTruckHash(window.location.hash, defaultMode);
      setMode(next);

      const targetId = window.location.hash.slice(1);
      if (!targetId) return;
      window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({ block: "start" });
      });
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [defaultMode]);

  const choose = (next: FoodTruckJourneyMode) => {
    setMode(next);
    const target = MODES.find((item) => item.id === next)?.hash;
    if (target) {
      window.history.replaceState(window.history.state, "", `#${target}`);
    }
  };

  const onTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? MODES.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % MODES.length
            : (index - 1 + MODES.length) % MODES.length;
    choose(MODES[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const panels: Record<FoodTruckJourneyMode, ReactNode> = {
    near: nearby,
    week,
    trucks,
  };

  return (
    <div className="food-truck-journeys">
      <div
        role="tablist"
        aria-label="Choose how to find a food truck"
        className="food-truck-mode-switch"
      >
        {MODES.map((item, index) => {
          const selected = item.id === mode;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`food-truck-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`food-truck-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(item.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>

      {MODES.map((item) => (
        <div
          key={item.id}
          id={`food-truck-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`food-truck-tab-${item.id}`}
          hidden={mode !== item.id}
          tabIndex={mode === item.id ? 0 : -1}
          className="food-truck-journey-panel"
        >
          {mode === item.id ? panels[item.id] : null}
        </div>
      ))}
    </div>
  );
}
