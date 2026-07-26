"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Armchair,
  ArrowUpRight,
  Droplets,
  LocateFixed,
  Map,
  PawPrint,
  PlugZap,
  Toilet,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Amenity } from "@/lib/loaders/amenities";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  ESSENTIAL_NEEDS,
  essentialDirectionsHref,
  essentialDistanceLabel,
  essentialMapHref,
  essentialNeed,
  isEssentialNearby,
  nearestEssential,
  type EssentialNeedId,
} from "@/lib/nearby-essentials";
import { Button } from "@/components/ui/Button";

const NEED_ICONS: Record<EssentialNeedId, LucideIcon> = {
  restroom: Toilet,
  water: Droplets,
  trash: Trash2,
  "dog-bags": PawPrint,
  seating: Armchair,
  power: PlugZap,
};

function placeLabel(value: string): string {
  return value
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function NearbyEssentials({
  points,
  initialNeed,
}: {
  points: Amenity[];
  initialNeed?: EssentialNeedId;
}) {
  const { state, requestHighAccuracy } = useGeolocation();
  const [activeId, setActiveId] = useState<EssentialNeedId | null>(
    initialNeed ?? null,
  );
  const [interactive, setInteractive] = useState(false);
  const activeNeed = essentialNeed(activeId);
  const position = state.status === "granted" ? state.position : null;
  const nearest = useMemo(
    () =>
      activeNeed && position
        ? nearestEssential(position, points, activeNeed)
        : null,
    [activeNeed, points, position],
  );
  const nearby = nearest ? isEssentialNearby(nearest.distanceM) : false;

  useEffect(() => {
    const timer = window.setTimeout(() => setInteractive(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const chooseNeed = (id: EssentialNeedId) => {
    setActiveId(id);
    if (state.status !== "granted" && state.status !== "loading") {
      requestHighAccuracy();
    }
  };

  return (
    <section
      aria-labelledby="nearby-essentials-heading"
      className="overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-brand-press)" }}
            >
              Need it now
            </p>
            <h2
              id="nearby-essentials-heading"
              className="mt-1 text-[17px] font-semibold leading-tight tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              Tap what you need.
            </h2>
          </div>
          <LocateFixed
            className="mt-0.5 h-5 w-5 shrink-0"
            strokeWidth={2}
            aria-hidden
            style={{ color: "var(--app-brand-press)" }}
          />
        </div>

        <div
          className="mt-3 grid grid-cols-3 gap-2"
          role="group"
          aria-label="Choose a nearby essential"
        >
          {ESSENTIAL_NEEDS.map((need) => {
            const Icon = NEED_ICONS[need.id];
            const active = activeId === need.id;
            return (
              <button
                key={need.id}
                type="button"
                disabled={!interactive}
                onClick={() => chooseNeed(need.id)}
                aria-pressed={active}
                className="tactile-interactive flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border px-1.5 py-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                style={{
                  borderColor: active
                    ? "var(--app-brand-press)"
                    : "var(--app-control-border)",
                  background: active
                    ? "var(--app-brand-tint-6)"
                    : "var(--app-bg-elevated-solid)",
                  color: active
                    ? "var(--app-brand-press)"
                    : "var(--app-ink)",
                }}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                <span className="text-[11.5px] font-semibold leading-none">
                  {need.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        aria-live="polite"
        className="border-t px-3.5 py-3.5 sm:px-4"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
        }}
      >
        {!activeNeed && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              Radius asks for location only after you choose.
            </p>
            <Button
              href="/map?amenity=restroom,water,trash,dog,outlet,seating"
              variant="quiet"
              size="sm"
              iconRight={<Map className="h-4 w-4" strokeWidth={2} aria-hidden />}
            >
              Map
            </Button>
          </div>
        )}

        {activeNeed && state.status === "loading" && (
          <div className="flex items-center gap-3">
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
              style={{ color: "var(--app-brand-press)" }}
              aria-hidden
            />
            <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Finding the closest mapped {activeNeed.resultLabel}…
            </p>
          </div>
        )}

        {activeNeed &&
          (state.status === "denied" ||
            state.status === "unavailable" ||
            state.status === "error") && (
            <div className="space-y-3">
              <div>
                <p className="text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  Radius needs your location to sort by distance.
                </p>
                <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                  You can retry or open every mapped {activeNeed.resultLabel} without sharing it.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={requestHighAccuracy}
                  variant="primary"
                  size="sm"
                  iconLeft={<LocateFixed className="h-4 w-4" strokeWidth={2} aria-hidden />}
                >
                  Try location
                </Button>
                <Button
                  href={essentialMapHref(activeNeed)}
                  variant="secondary"
                  size="sm"
                >
                  Open map
                </Button>
              </div>
            </div>
          )}

        {activeNeed && position && nearest && nearby && (
          <div>
            <p
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Closest mapped · {essentialDistanceLabel(nearest.distanceM)}
            </p>
            <p
              className="mt-1 text-[16px] font-semibold leading-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {nearest.point.name}
            </p>
            {(nearest.point.detail || nearest.point.municipality) && (
              <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                {nearest.point.detail ?? placeLabel(nearest.point.municipality)}
              </p>
            )}
            {position.accuracy > 250 && (
              <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                Your location is approximate, so check the map before walking.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                href={essentialDirectionsHref(nearest.point)}
                target="_blank"
                rel="noopener noreferrer"
                variant="primary"
                size="sm"
                iconRight={<ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />}
              >
                Walk there
              </Button>
              <Button
                href={essentialMapHref(activeNeed, nearest.point)}
                variant="secondary"
                size="sm"
              >
                See all
              </Button>
            </div>
          </div>
        )}

        {activeNeed && position && nearest && !nearby && (
          <div className="space-y-3">
            <div>
              <p className="text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                No {activeNeed.resultLabel} is mapped close by.
              </p>
              <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                The closest known point is {essentialDistanceLabel(nearest.distanceM)} away at{" "}
                {nearest.point.name}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                href={essentialMapHref(activeNeed, nearest.point)}
                variant="primary"
                size="sm"
              >
                See map
              </Button>
              <Button
                href={essentialDirectionsHref(nearest.point)}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="sm"
              >
                Directions
              </Button>
            </div>
          </div>
        )}

        {activeNeed && position && !nearest && (
          <div className="space-y-3">
            <div>
              <p className="text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                No {activeNeed.resultLabel} is mapped yet.
              </p>
              <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                Radius will not substitute a different place or invent an answer.
              </p>
            </div>
            <Button href={essentialMapHref(activeNeed)} variant="secondary" size="sm">
              Open map
            </Button>
          </div>
        )}

        {activeNeed && state.status === "idle" && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              Use your location to find the closest mapped {activeNeed.resultLabel}.
            </p>
            <Button
              onClick={requestHighAccuracy}
              variant="primary"
              size="sm"
              iconLeft={<LocateFixed className="h-4 w-4" strokeWidth={2} aria-hidden />}
            >
              Locate
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
