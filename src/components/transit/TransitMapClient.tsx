"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ComponentProps, type CSSProperties } from "react";
import TransitNetworkPreview from "./TransitNetworkPreview";
import { useMounted } from "@/hooks/useSaved";
import { isCurrentTransitStop } from "@/lib/transit-static";
import {
  isTransitRouteFocusDetail, isTransitStopFocusDetail, isTransitVehicleFocusDetail,
  peekPendingTransitFocus, retainPendingTransitFocus,
  TRANSIT_ROUTE_FOCUS_EVENT, TRANSIT_STOP_FOCUS_EVENT, TRANSIT_VEHICLE_FOCUS_EVENT,
  type PendingTransitFocus,
} from "@/lib/transit-focus";

type TransitMapProps = ComponentProps<typeof import("./TransitMap").default>;
type Props = TransitMapProps & { deferUntilRequested?: boolean };

// The renderer remains client-only and split. On /transit its component is not
// mounted until requested, so closed-map visitors do not initialize Mapbox or
// the map's live layers. Other consumers retain the existing eager behavior.
const TransitMap = dynamic(() => import("./TransitMap").then(({ default: Map }) =>
  function FocusReadyMap({ onFocusReady, ...props }: TransitMapProps & { onFocusReady: () => () => void }) {
    // Child map effects attach its listeners before this acknowledgement. The
    // launcher must stop retaining live events once that consumer owns them.
    useEffect(onFocusReady, [onFocusReady]);
    return <Map {...props} />;
  }), {
  ssr: false,
  loading: () => <div className="grid w-full place-items-center rounded-[var(--app-radius-lg)] border text-[13px]"
    style={{ height: "var(--transit-map-placeholder-height, 380px)", borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
    role="status">Loading the map…</div>,
});

function isMapRequest(intent: PendingTransitFocus, props: Pick<TransitMapProps, "shapes" | "interactiveStops">): boolean {
  if (intent.kind === "stop") return props.interactiveStops === true
    && intent.detail.selectForRider !== true && isCurrentTransitStop(intent.detail.stopId);
  if (intent.kind === "route") return props.shapes.features.some((feature) => feature.properties.routeId === intent.detail.routeId);
  return true;
}

export default function TransitMapClient({ deferUntilRequested = false, ...props }: Props) {
  const interactionReady = useMounted();
  const [requested, setRequested] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const consumerReady = useRef(false);
  const onFocusReady = useCallback(() => {
    consumerReady.current = true;
    return () => { consumerReady.current = false; };
  }, []);
  const height = props.height ?? 380;
  const { shapes, interactiveStops } = props;
  useEffect(() => {
    if (!deferUntilRequested) return;
    const activate = (intent: PendingTransitFocus) => {
      if (consumerReady.current || !isMapRequest(intent, { shapes, interactiveStops }) || !retainPendingTransitFocus(intent)) return;
      setRequested(true);
    };
    const route = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      if (isTransitRouteFocusDetail(detail)) activate({ kind: "route", detail });
    };
    const stop = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      if (isTransitStopFocusDetail(detail)) activate({ kind: "stop", detail });
    };
    const vehicle = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      if (isTransitVehicleFocusDetail(detail)) activate({ kind: "vehicle", detail });
    };
    window.addEventListener(TRANSIT_ROUTE_FOCUS_EVENT, route);
    window.addEventListener(TRANSIT_STOP_FOCUS_EVENT, stop);
    window.addEventListener(TRANSIT_VEHICLE_FOCUS_EVENT, vehicle);
    // Do not consume: the actual map takes the latest intent after its chunk
    // mounts. This also catches an intent made before this launcher hydrated.
    const timer = window.setTimeout(() => {
      const pending = peekPendingTransitFocus();
      if (pending && isMapRequest(pending, { shapes, interactiveStops })) setRequested(true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(TRANSIT_ROUTE_FOCUS_EVENT, route);
      window.removeEventListener(TRANSIT_STOP_FOCUS_EVENT, stop);
      window.removeEventListener(TRANSIT_VEHICLE_FOCUS_EVENT, vehicle);
    };
  }, [deferUntilRequested, shapes, interactiveStops]);

  return <div ref={regionRef} tabIndex={-1} role="region"
    aria-label="Transit network map" data-transit-map-state={deferUntilRequested && !requested ? "closed" : "open"}
    style={{ "--transit-map-placeholder-height": typeof height === "number" ? `${height}px` : height } as CSSProperties}>
    {!deferUntilRequested || requested ? <TransitMap {...props} onFocusReady={onFocusReady} /> :
      <div className="grid place-items-center rounded-[var(--app-radius-lg)] border p-5 text-center"
        style={{ minHeight: height, gap: ".875rem", borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
        <TransitNetworkPreview shapes={shapes} />
        <div className="max-w-sm space-y-3">
          <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>See your stop in the network</p>
          <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>Open the live map, or keep using stop arrivals above.</p>
          <button type="button" disabled={!interactionReady} className="tactile inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-md)] px-4 text-[14px] font-semibold"
            style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
            onClick={() => { setRequested(true); regionRef.current?.focus({ preventScroll: true }); }}>Open live map</button>
        </div>
      </div>}
  </div>;
}
