"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkMinus,
  BusFront,
  Clock3,
  LocateFixed,
  MapPin,
  Radio,
} from "lucide-react";
import TRANSIT from "@/data/transit.json";
import { readableTextOn } from "@/lib/color/readableText";
import { haptic } from "@/lib/haptics";
import {
  findCurrentTransitVehicle,
  requestTransitRouteFocus,
  requestTransitVehicleFocus,
  type TransitVehicleFocusDetail,
} from "@/lib/transit-focus";
import {
  isPredictionFresh,
  minutesUntilArrival,
  savedTransitBusMatchesVehicle,
  type SavedTransitBus,
  type SavedTransitStop,
  type TransitBusRef,
} from "@/components/transit/transitRiderModel";
import { useLiveVehicles } from "@/components/transit/useLiveVehicles";
import {
  useStopArrivals,
  type StopPrediction,
} from "@/components/transit/useStopArrivals";

type TransitRoute = {
  id: string;
  short: string;
  name: string;
  color: string;
};

const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(
  (TRANSIT.routes as TransitRoute[]).map((route) => [route.id, route]),
);

function RouteBadge({ route }: { route?: TransitRoute }) {
  const color = route?.color ?? "var(--app-cool)";
  return (
    <span
      aria-label={route ? `Route ${route.short}` : "TransIT bus"}
      className="grid h-7 min-w-8 shrink-0 place-items-center rounded-full px-2 font-mono text-[11px] font-bold tabular-nums"
      style={{
        background: color,
        color: route ? readableTextOn(route.color) : "#FFFFFF",
      }}
    >
      {route?.short ?? "Bus"}
    </span>
  );
}

function usablePrediction(
  prediction: StopPrediction,
  nowMs: number,
  feedLive: boolean,
): { prediction: StopPrediction; minutes: number } | null {
  if (
    prediction.tripScheduleRelationship === "CANCELED" ||
    prediction.tripScheduleRelationship === "DELETED" ||
    prediction.scheduleRelationship === "SKIPPED" ||
    prediction.scheduleRelationship === "NO_DATA" ||
    !isPredictionFresh(prediction.timestamp, nowMs, feedLive)
  ) {
    return null;
  }
  const minutes = minutesUntilArrival(prediction.arrivalEpoch, nowMs);
  return minutes == null ? null : { prediction, minutes };
}

function SavedStopTracker({
  stop,
  onRemove,
  onTrack,
}: {
  stop: SavedTransitStop;
  onRemove: (stop: SavedTransitStop) => void;
  onTrack: (detail: TransitVehicleFocusDetail) => void;
}) {
  const { snapshot, nowMs } = useStopArrivals(stop.id);
  const liveVehicles = useLiveVehicles();
  const next = useMemo(
    () =>
      snapshot.predictions
        .map((prediction) =>
          usablePrediction(
            prediction,
            nowMs,
            snapshot.status === "live",
          ),
        )
        .filter(
          (
            item,
          ): item is {
            prediction: StopPrediction;
            minutes: number;
          } => item != null,
        )
        .sort((a, b) => a.minutes - b.minutes)[0] ?? null,
    [nowMs, snapshot.predictions, snapshot.status],
  );
  const route = next?.prediction.routeId
    ? ROUTE_BY_ID[next.prediction.routeId]
    : undefined;
  const vehicle = next
    ? findCurrentTransitVehicle({
        vehicles: liveVehicles.vehicles,
        vehicleId: next.prediction.vehicleId,
        expectedRouteId: next.prediction.routeId,
        expectedTripId: next.prediction.tripId,
        feedCurrent:
          liveVehicles.loaded &&
          liveVehicles.available &&
          !liveVehicles.stale &&
          liveVehicles.status !== "unavailable",
        nowMs,
      })
    : null;
  const exactFocus =
    vehicle && next
      ? {
          vehicleId: vehicle.vehicleId,
          routeId: vehicle.routeId ?? next.prediction.routeId,
          bus: { lng: vehicle.lng, lat: vehicle.lat },
          stop: { lng: stop.lng, lat: stop.lat },
          stopId: stop.id,
          stopName: stop.name,
        }
      : null;
  const status =
    snapshot.status === "loading"
      ? "Checking live arrivals"
      : snapshot.status === "unavailable"
        ? "Live arrivals unavailable"
        : snapshot.status === "stale"
          ? "Arrival feed delayed"
          : next
            ? next.minutes === 0
              ? "Due now"
              : `${next.minutes} min`
            : "No live arrival reporting";

  return (
    <article
      id="saved-stop-tracker"
      className="rounded-[var(--app-radius-md)] border p-3"
      style={{
        borderColor:
          "color-mix(in srgb, var(--app-cool) 28%, var(--app-border))",
        background:
          "linear-gradient(145deg, color-mix(in srgb, var(--app-cool) 7%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 62%)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
          style={{
            color: "var(--app-cool)",
            background: "var(--app-cool-tint-10)",
          }}
        >
          <MapPin className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <strong
            className="block text-[14px] leading-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {stop.name}
          </strong>
          <span
            className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]"
            style={{
              color:
                next && snapshot.status === "live"
                  ? "var(--app-positive)"
                  : "var(--app-ink-3)",
            }}
          >
            <Clock3 className="h-3 w-3" strokeWidth={2.1} aria-hidden />
            {status}
            {route ? (
              <>
                <span aria-hidden>·</span>
                <RouteBadge route={route} />
                {next?.prediction.headsign ? (
                  <span>to {next.prediction.headsign}</span>
                ) : null}
              </>
            ) : null}
          </span>
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {exactFocus ? (
          <button
            type="button"
            onClick={() => onTrack(exactFocus)}
            className="tap-44 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold"
            style={{
              borderColor:
                "color-mix(in srgb, var(--app-cool) 38%, var(--app-border))",
              color: "var(--app-cool)",
              background: "var(--app-cool-tint-6)",
            }}
          >
            <LocateFixed className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            Track live
          </button>
        ) : null}
        <Link
          href={`/transit?stop=${encodeURIComponent(stop.id)}#my-stop-heading`}
          className="tap-44 inline-flex min-h-11 items-center rounded-full border px-3 text-[11px] font-semibold"
          style={{
            borderColor: "var(--app-control-border)",
            color: "var(--app-cool)",
            background: "var(--app-bg-elevated-solid)",
          }}
        >
          See arrivals
        </Link>
        <button
          type="button"
          onClick={() => onRemove(stop)}
          aria-label={`Remove ${stop.name} from Saved`}
          className="tap-44 ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          <BookmarkMinus className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
          Remove
        </button>
      </div>
    </article>
  );
}

function SavedBusCard({
  bus,
  onRemove,
  nowMs,
}: {
  bus: SavedTransitBus;
  onRemove: (bus: TransitBusRef) => void;
  nowMs: number;
}) {
  const router = useRouter();
  const liveVehicles = useLiveVehicles();
  const candidate =
    liveVehicles.vehicles.find(
      (vehicle) => bus.tripId && vehicle.tripId === bus.tripId,
    ) ??
    liveVehicles.vehicles.find(
      (vehicle) => vehicle.vehicleId === bus.vehicleId,
    );
  const exactRun =
    candidate &&
    savedTransitBusMatchesVehicle(bus, candidate) &&
    liveVehicles.loaded &&
    liveVehicles.available &&
    !liveVehicles.stale
      ? findCurrentTransitVehicle({
          vehicles: liveVehicles.vehicles,
          vehicleId: candidate.vehicleId,
          expectedRouteId: bus.routeId,
          expectedTripId: bus.tripId,
          feedCurrent: true,
          nowMs: nowMs || liveVehicles.fetchedAt,
        })
      : null;
  const currentRouteId = exactRun?.routeId ?? bus.routeId;
  const route = currentRouteId ? ROUTE_BY_ID[currentRouteId] : undefined;
  const eta = exactRun?.nextStop?.etaEpoch
    ? minutesUntilArrival(
        exactRun.nextStop.etaEpoch,
        nowMs,
      )
    : null;
  const focusStop = exactRun?.nextStop ?? bus.targetStop;
  const status =
    !liveVehicles.loaded
      ? "Checking live position"
      : !liveVehicles.available
        ? "Live positions unavailable"
        : liveVehicles.stale
          ? "Live feed delayed"
          : exactRun
            ? "Live now"
            : "Saved trip not reporting";

  const openTransit = () => {
    if (exactRun && focusStop) {
      requestTransitVehicleFocus({
        vehicleId: exactRun.vehicleId,
        routeId: exactRun.routeId,
        bus: { lng: exactRun.lng, lat: exactRun.lat },
        stop: {
          lng: focusStop.lng,
          lat: focusStop.lat,
        },
        stopId: focusStop.id,
        stopName: focusStop.name,
      });
    } else if (bus.routeId) {
      requestTransitRouteFocus(bus.routeId);
    }
    haptic("light");
    router.push("/transit#live-network-heading");
  };

  return (
    <li
      className="rounded-[var(--app-radius-md)] border p-3"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <RouteBadge route={route} />
        <span className="min-w-0 flex-1">
          <strong
            className="block text-[13.5px] leading-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {bus.headsign
              ? `${route?.name ?? bus.routeName ?? "TransIT bus"} to ${bus.headsign}`
              : route?.name ?? bus.routeName ?? "Saved TransIT bus trip"}
          </strong>
          <span
            className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]"
            style={{
              color: exactRun
                ? "var(--app-positive)"
                : "var(--app-ink-3)",
            }}
          >
            <Radio className="h-3 w-3" strokeWidth={2.2} aria-hidden />
            {status}
            <span aria-hidden>·</span>
            bus {bus.vehicleId}
          </span>
          {exactRun?.nextStop ? (
            <span
              className="mt-1 block text-[11px]"
              style={{ color: "var(--app-ink-2)" }}
            >
              Next: {exactRun.nextStop.name}
              {eta != null ? ` · ${eta === 0 ? "due" : `${eta} min`}` : ""}
            </span>
          ) : bus.targetStop ? (
            <span
              className="mt-1 block text-[11px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Saved for {bus.targetStop.name}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={openTransit}
          className="tap-44 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold"
          style={{
            borderColor:
              "color-mix(in srgb, var(--app-cool) 38%, var(--app-border))",
            color: "var(--app-cool)",
            background: exactRun
              ? "var(--app-cool-tint-6)"
              : "var(--app-bg-elevated-solid)",
          }}
        >
          {exactRun && focusStop ? (
            <LocateFixed className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          ) : (
            <BusFront className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          )}
          {exactRun && focusStop
            ? "Track live"
            : bus.routeId
              ? "View route"
              : "Open transit"}
        </button>
        {bus.targetStop ? (
          <Link
            href={`/transit?stop=${encodeURIComponent(bus.targetStop.id)}#my-stop-heading`}
            className="tap-44 inline-flex min-h-11 items-center rounded-full border px-3 text-[11px] font-semibold"
            style={{
              borderColor: "var(--app-control-border)",
              color: "var(--app-ink-2)",
              background: "var(--app-bg-elevated-solid)",
            }}
          >
            See stop
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove(bus)}
          aria-label={`Remove bus ${bus.vehicleId} from Saved`}
          className="tap-44 ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          <BookmarkMinus className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
          Remove
        </button>
      </div>
    </li>
  );
}

export default function SavedTransitSection({
  stops,
  buses,
  onRemoveStop,
  onRemoveBus,
}: {
  stops: SavedTransitStop[];
  buses: SavedTransitBus[];
  onRemoveStop: (
    stop: SavedTransitStop,
  ) => { removed: boolean; persistent: boolean };
  onRemoveBus: (
    bus: TransitBusRef,
  ) => { removed: boolean; persistent: boolean };
}) {
  const router = useRouter();
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [nowMs, setNowMs] = useState(0);
  const activeStop =
    stops.find((stop) => stop.id === selectedStopId) ?? stops[0] ?? null;
  const total = stops.length + buses.length;

  useEffect(() => {
    let timer: number | null = null;
    const stopClock = () => {
      if (timer == null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const startClock = () => {
      if (timer != null || document.visibilityState === "hidden") return;
      timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stopClock();
      else startClock();
    };
    startClock();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopClock();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (total === 0) {
    return (
      <span className="sr-only" role="status" aria-live="polite">
        {notice}
      </span>
    );
  }

  const trackStopBus = (detail: TransitVehicleFocusDetail) => {
    if (!requestTransitVehicleFocus(detail)) return;
    haptic("success");
    router.push("/transit#live-network-heading");
  };
  const returnFocusToHeading = () => {
    window.requestAnimationFrame(() => {
      (
        document.getElementById("saved-transit-heading") ??
        document.getElementById("saved-page-heading")
      )?.focus();
    });
  };
  const removeStop = (stop: SavedTransitStop) => {
    const result = onRemoveStop(stop);
    setNotice(
      result.removed && result.persistent
        ? `${stop.name} removed from Saved.`
        : result.removed
          ? `${stop.name} removed for this visit. Device storage is unavailable.`
        : `${stop.name} was already removed.`,
    );
    haptic(result.removed ? "light" : "warning");
    returnFocusToHeading();
  };
  const removeBus = (bus: TransitBusRef) => {
    const result = onRemoveBus(bus);
    setNotice(
      result.removed && result.persistent
        ? `Bus ${bus.vehicleId} removed from Saved.`
        : result.removed
          ? `Bus ${bus.vehicleId} removed for this visit. Device storage is unavailable.`
        : `Bus ${bus.vehicleId} was already removed.`,
    );
    haptic(result.removed ? "light" : "warning");
    returnFocusToHeading();
  };

  return (
    <section
      aria-labelledby="saved-transit-heading"
      className="space-y-2.5"
    >
      <header className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
          style={{
            color: "var(--app-cool)",
            background: "var(--app-cool-tint-10)",
          }}
        >
          <BusFront className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <h2
            id="saved-transit-heading"
            tabIndex={-1}
            className="text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-ink)" }}
          >
            Saved transit
          </h2>
          <span
            className="block text-[10.5px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {total} saved on this device · updates while this page is open
          </span>
        </span>
        <Link
          href="/transit"
          className="tap-44-y shrink-0 text-[11px] font-semibold"
          style={{ color: "var(--app-cool)" }}
        >
          Open transit
        </Link>
      </header>

      {stops.length > 0 ? (
        <div className="space-y-2">
          <div
            role="group"
            aria-label="Choose a saved stop to track"
            className="flex snap-x gap-1.5 overflow-x-auto pb-0.5 scrollbar-none"
          >
            {stops.map((stop) => {
              const active = stop.id === activeStop?.id;
              return (
                <button
                  key={stop.id}
                  type="button"
                  aria-pressed={active}
                  aria-controls="saved-stop-tracker"
                  onClick={() => {
                    setSelectedStopId(stop.id);
                    setNotice(`${stop.name} selected for live arrivals.`);
                    haptic("light");
                  }}
                  className="tap-44 shrink-0 snap-start rounded-full border px-3 text-[11px] font-semibold"
                  style={{
                    borderColor: active
                      ? "var(--app-cool)"
                      : "var(--app-control-border)",
                    color: active
                      ? "var(--app-cool)"
                      : "var(--app-ink-2)",
                    background: active
                      ? "var(--app-cool-tint-6)"
                      : "var(--app-bg-elevated-solid)",
                  }}
                >
                  {stop.name}
                </button>
              );
            })}
          </div>
          {activeStop ? (
            <SavedStopTracker
              key={activeStop.id}
              stop={activeStop}
              onRemove={removeStop}
              onTrack={trackStopBus}
            />
          ) : null}
        </div>
      ) : null}

      {buses.length > 0 ? (
        <div className="space-y-1.5">
          <h3
            className="px-0.5 text-[10px] font-bold uppercase tracking-[0.11em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Saved bus trips
          </h3>
          <ul className="space-y-2">
            {buses.map((bus) => (
              <SavedBusCard
                key={bus.watchId}
                bus={bus}
                onRemove={removeBus}
                nowMs={nowMs}
              />
            ))}
          </ul>
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {notice}
      </span>
    </section>
  );
}
