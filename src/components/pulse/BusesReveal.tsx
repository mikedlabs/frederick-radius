"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bus, ChevronDown, ChevronUp, LoaderCircle, RotateCcw } from "lucide-react";
import type { LineFC } from "@/lib/integrations/transitFrederick";

// None of the live transit views belong in the closed-state bundle. The map
// already code-splits Mapbox internally; the two boards also carry the route
// catalog, geometry helpers, polling hook, and animation code, so defer them
// until the rider explicitly asks for this part of Pulse.
const loadTransitMap = () => import("@/components/transit/TransitMap");
const TransitMap = dynamic(loadTransitMap, {
  ssr: false,
  loading: () => null,
});
const RoutePearls = dynamic(() => import("@/components/transit/RoutePearls"), {
  ssr: false,
  loading: () => null,
});
const NextStopsBoard = dynamic(() => import("@/components/transit/NextStopsBoard"), {
  ssr: false,
  loading: () => null,
});

type ShapesState =
  | { status: "idle" | "loading" }
  | { status: "ready"; shapes: LineFC }
  | { status: "error" };

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
  const requestRef = useRef<AbortController | null>(null);

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
        aria-label={open ? "Hide live buses" : "Show live buses"}
        aria-expanded={open}
        aria-controls="pulse-live-buses"
        className="tactile-interactive flex w-full items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-4 py-3 text-left transition active:scale-[0.99]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-positive) 14%, transparent)",
              color: "var(--app-positive)",
            }}
          >
            <Bus className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
              {open ? "Live buses" : "Show live buses"}
            </span>
            <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
              {open ? "Route progress, map, and next stops" : "See every route and follow buses in real time"}
            </span>
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
        )}
      </button>

      {open ? (
        <div id="pulse-live-buses" className="space-y-2.5">
          <RoutePearls />

          {shapesState.status === "ready" ? (
            <TransitMap
              shapes={shapesState.shapes}
              height={300}
              center={[-77.4105, 39.4143]}
              zoom={12.5}
              liveBuses
              highlightRoutes
              hideBadge
              lockToService
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
                The route map did not load. Live bus progress may still be available above.
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

          <NextStopsBoard />
        </div>
      ) : null}
    </section>
  );
}
