"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bus, ChevronDown, ChevronUp, LoaderCircle, RotateCcw } from "lucide-react";
import type { LineFC } from "@/lib/integrations/transitFrederick";

// The live bus map is heavy (Mapbox), so defer it until the rider opens this
// part of Pulse. The detailed route + arrival boards moved to /transit; Pulse
// shows just the live buses on the map.
const loadTransitMap = () => import("@/components/transit/TransitMap");
const TransitMap = dynamic(loadTransitMap, {
  ssr: false,
  loading: () => null,
});

type ShapesState =
  | { status: "idle" | "loading" }
  | { status: "ready"; shapes: LineFC }
  | { status: "error" };

type TransitFeedStatus = "ok" | "degraded" | "unavailable";

type TransitCollectionPayload = {
  available?: unknown;
  status?: unknown;
  vehicles?: unknown;
  alerts?: unknown;
};

export type TransitClosedSummary = {
  text: string;
  tone: "current" | "attention";
};

function collectionState(
  payload: TransitCollectionPayload | null,
  key: "vehicles" | "alerts",
): { available: boolean; count: number; status: TransitFeedStatus } {
  const status = payload?.status;
  const collection = payload?.[key];
  if (
    payload?.available !== true ||
    !Array.isArray(collection) ||
    (status !== "ok" && status !== "degraded")
  ) {
    return { available: false, count: 0, status: "unavailable" };
  }
  return { available: true, count: collection.length, status };
}

/**
 * A zero only appears when the corresponding provider answered. Failed,
 * malformed, and unavailable responses stay unavailable instead of becoming
 * "no buses" or "no alerts."
 */
export function buildTransitClosedSummary(
  vehiclePayload: TransitCollectionPayload | null,
  alertPayload: TransitCollectionPayload | null,
): TransitClosedSummary {
  const vehicles = collectionState(vehiclePayload, "vehicles");
  const alerts = collectionState(alertPayload, "alerts");
  const parts: string[] = [];

  if (!vehicles.available) {
    parts.push("Bus locations unavailable");
  } else if (vehicles.count === 0) {
    parts.push("No buses reporting positions");
  } else {
    parts.push(
      `${vehicles.count} ${vehicles.count === 1 ? "bus" : "buses"} reporting`,
    );
  }

  if (!alerts.available) {
    parts.push("alerts unavailable");
  } else if (alerts.count === 0) {
    parts.push("no service alerts posted");
  } else {
    parts.push(
      `${alerts.count} service ${alerts.count === 1 ? "alert" : "alerts"}`,
    );
  }

  if (vehicles.available && vehicles.status === "degraded") {
    parts.push("ETAs limited");
  }
  if (alerts.available && alerts.status === "degraded") {
    parts.push("alert feed incomplete");
  }

  return {
    text: parts.join(" · "),
    tone:
      !vehicles.available ||
      !alerts.available ||
      vehicles.status === "degraded" ||
      alerts.status === "degraded" ||
      alerts.count > 0
        ? "attention"
        : "current",
  };
}

async function readCollection(
  href: string,
  signal: AbortSignal,
): Promise<TransitCollectionPayload | null> {
  try {
    const response = await fetch(href, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return payload && typeof payload === "object"
      ? (payload as TransitCollectionPayload)
      : null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return null;
  }
}

function isLineFC(value: unknown): value is LineFC {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; features?: unknown };
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}

/**
 * BusesReveal — live TransIT tools loaded only after one deliberate tap.
 *
 * The closed state makes no geometry request and mounts none of the transit
 * visualizations. Opening starts the route-shape request while their chunks
 * load in parallel. Once fetched, shapes stay in component state so collapsing
 * and reopening is instant. Upstream failures stay local to the map and offer
 * a real retry; the live route and next-stop boards can still be useful.
 */
export default function BusesReveal() {
  const [open, setOpen] = useState(false);
  const [shapesState, setShapesState] = useState<ShapesState>({ status: "idle" });
  const [closedSummary, setClosedSummary] = useState<TransitClosedSummary>({
    text: "Checking live service…",
    tone: "current",
  });
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readCollection("/api/transit/vehicles", controller.signal),
      readCollection("/api/transit/alerts", controller.signal),
    ]).then(([vehicles, alerts]) => {
      if (controller.signal.aborted) return;
      setClosedSummary(buildTransitClosedSummary(vehicles, alerts));
    });
    return () => controller.abort();
  }, []);

  const loadShapes = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setShapesState({ status: "loading" });

    try {
      const response = await fetch("/api/transit/shapes", {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("route shapes unavailable");

      const payload = (await response.json()) as { shapes?: unknown };
      if (!isLineFC(payload.shapes) || payload.shapes.features.length === 0) {
        throw new Error("invalid route shapes");
      }
      setShapesState({ status: "ready", shapes: payload.shapes });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShapesState({ status: "error" });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }

    // Start the large Mapbox chunk in the same user gesture as the geometry
    // request. It remains absent from the closed state without making the map
    // wait for JSON before its code can begin downloading.
    void loadTransitMap().catch(() => undefined);
    setOpen(true);
    if (shapesState.status === "idle" || shapesState.status === "error") {
      void loadShapes();
    }
  }

  return (
    <section className="space-y-2.5" aria-label="Live TransIT buses">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={open ? "Hide current buses" : "Show current buses"}
        aria-describedby="pulse-live-buses-summary"
        aria-expanded={open}
        aria-controls="pulse-live-buses"
        className="tactile-interactive flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--app-radius-sm)] border px-3 py-2 text-left transition active:scale-[0.99]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-cool) 12%, transparent)",
              color: "var(--app-cool)",
            }}
          >
            <Bus className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              {open ? "Buses right now" : "Show current buses"}
            </span>
            <span
              id="pulse-live-buses-summary"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="block min-h-[1rem] max-w-[min(68vw,28rem)] truncate text-[10.5px]"
              style={{
                color:
                  !open && closedSummary.tone === "attention"
                    ? "var(--app-warning)"
                    : "var(--app-ink-3)",
              }}
              title={open ? undefined : closedSummary.text}
            >
              {open ? "Route progress, map, and next stops" : closedSummary.text}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
            TransIT
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
          )}
        </span>
      </button>

      {open ? (
        // Just the live buses on Pulse: the map with live vehicle positions.
        // The detailed route + arrival boards live on /transit now.
        <div
          id="pulse-live-buses"
          className="space-y-3 rounded-[var(--app-radius-md)] border p-3"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          {shapesState.status === "ready" ? (
            <TransitMap
              shapes={shapesState.shapes}
              height={280}
              center={[-77.4105, 39.4143]}
              zoom={12.5}
              liveBuses
              highlightRoutes
              hideBadge
              lockToService
              showTrains={false}
            />
          ) : shapesState.status === "error" ? (
            <div
              role="alert"
              className="flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-[var(--app-radius-lg)] border px-5 py-6 text-center"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-sunken)",
                color: "var(--app-ink-3)",
              }}
            >
              <p className="max-w-[290px] text-[13px] leading-relaxed">
                The live bus map did not load. Try again in a moment.
              </p>
              <button
                type="button"
                onClick={() => void loadShapes()}
                className="tactile-interactive inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition active:scale-[0.98]"
                style={{
                  borderColor: "var(--app-border-strong)",
                  background: "var(--app-bg-elevated)",
                  color: "var(--app-ink)",
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Try map again
              </button>
            </div>
          ) : (
            <div
              role="status"
              className="grid min-h-[150px] place-items-center rounded-[var(--app-radius-lg)] border text-[13px]"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-sunken)",
                color: "var(--app-ink-3)",
              }}
            >
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2.25} aria-hidden />
                Loading route map…
              </span>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
