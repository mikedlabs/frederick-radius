"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BusFront, ChevronDown, ChevronUp, LoaderCircle, RotateCcw } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import type { LineFC } from "@/lib/integrations/transitFrederick";
import styles from "./BusesReveal.module.css";

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
 * load in parallel. The map lives in the shared fixed sheet instead of adding
 * 280 pixels in the middle of Pulse, so opening it never moves the live briefing
 * out from under the rider. Once fetched, shapes stay in component state so
 * closing and reopening is instant. Upstream failures stay local to the map
 * and offer a real retry.
 */
export default function BusesReveal() {
  const [open, setOpen] = useState(false);
  const [shapesState, setShapesState] = useState<ShapesState>({ status: "idle" });
  const [closedSummary, setClosedSummary] = useState<TransitClosedSummary>({
    text: "Checking live service…",
    tone: "current",
  });
  const requestRef = useRef<AbortController | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

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
    <section className={styles.reveal} aria-label="Live TransIT buses">
      <button
        ref={launcherRef}
        type="button"
        onClick={toggleOpen}
        aria-label={open ? "Hide current buses" : "Show current buses"}
        aria-describedby="pulse-live-buses-summary"
        aria-expanded={open}
        aria-controls="pulse-live-buses"
        className={styles.launcher}
      >
        <span className={styles.identity} aria-hidden>
          <BusFront strokeWidth={1.8} />
          <span className={styles.routeAccent} />
        </span>
        <span className={styles.launcherCopy}>
          <span className={styles.eyebrow}>Frederick County TransIT</span>
          <span className={styles.title}>
            {open ? "Buses right now" : "Live bus map"}
          </span>
          <span
            id="pulse-live-buses-summary"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={styles.summary}
            data-tone={!open ? closedSummary.tone : "current"}
          >
            <span className={styles.statusDot} aria-hidden />
            <span>{open ? "Live locations and route paths" : closedSummary.text}</span>
          </span>
        </span>
        <span className={styles.openIcon} aria-hidden>
          {open ? <ChevronUp strokeWidth={2} /> : <ChevronDown strokeWidth={2} />}
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        returnFocusRef={launcherRef}
        title="Buses right now"
        subtitle="Frederick County TransIT"
        maxHeight="78dvh"
        footer={
          <Link href="/transit" prefetch={false} className={styles.arrivalsLink}>
            <span>Find stop arrivals</span>
            <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </Link>
        }
      >
        {/* Pulse keeps one live map. Stop arrivals and saved rider tools remain
            on the dedicated transit page, reached from the sheet footer. */}
        <div id="pulse-live-buses" className={styles.mapContent}>
          {shapesState.status === "ready" && (
            <div className={styles.mapIntro}>
              <svg className={styles.routeMotif} viewBox="0 0 48 16" fill="none" aria-hidden>
                <path d="M5 8H43" stroke="currentColor" strokeWidth="2" />
                <circle cx="5" cy="8" r="3" />
                <circle cx="24" cy="8" r="3" />
                <circle cx="43" cy="8" r="3" />
              </svg>
              <p>Choose a route to focus the map.</p>
            </div>
          )}
          <div className={styles.mapFrame}>
            {shapesState.status === "ready" ? (
              <TransitMap
                shapes={shapesState.shapes}
                height="clamp(17.5rem, 40dvh, 23rem)"
                center={[-77.4105, 39.4143]}
                zoom={12.5}
                liveBuses
                highlightRoutes
                hideBadge
                lockToService
                showTrains={false}
              />
            ) : shapesState.status === "error" ? (
              <div role="alert" className={styles.mapState}>
                <BusFront className={styles.stateIcon} strokeWidth={1.8} aria-hidden />
                <p>The live bus map did not load. Try again in a moment.</p>
                <button
                  type="button"
                  onClick={() => void loadShapes()}
                  className={styles.retry}
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Try map again
                </button>
              </div>
            ) : (
              <div role="status" className={styles.mapState}>
                <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
                <p>Loading route map…</p>
              </div>
            )}
          </div>
        </div>
      </Sheet>
    </section>
  );
}
