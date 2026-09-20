"use client";

import { BusFront, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { useLiveVehicles } from "@/components/transit/useLiveVehicles";
import { fairNearbyVehicles } from "@/lib/fair/live-transit";

function LiveLayer({ condensed }: { condensed: boolean }) {
  const snapshot = useLiveVehicles();
  const vehicles = fairNearbyVehicles(snapshot);
  const status = !snapshot.loaded ? "Checking County Transit."
    : !snapshot.available || snapshot.stale ? "Live positions are unavailable."
    : vehicles.length === 0 ? "No fresh bus positions near the Fairgrounds."
    : `${vehicles.length} county bus${vehicles.length === 1 ? "" : "es"} nearby now.`;
  return <>
    <div
      data-fair-transit-status
      className={`absolute left-[12px] right-[12px] z-10 max-w-[280px] overflow-y-auto rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] p-[12px] shadow-[var(--app-elev-2)] ${condensed ? "top-[168px]" : "top-[12rem] sm:top-[228px]"}`}
      style={{
        borderColor: "var(--app-border)",
        maxHeight: `calc(100% - ${condensed ? 180 : 244}px - var(--fair-map-action-bar-clearance, 96px))`,
      }}
    >
      <p role="status" className="text-[13px] font-semibold">{status}</p>
      <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        Positions now, not your selected Fair date. Nearby does not mean Fair service.
      </p>
      <a href="/transit" target="_blank" rel="noopener noreferrer" className="tap-44 mt-1 inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold">
        County transit details <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
    </div>
    {vehicles.map((vehicle) => <Marker key={vehicle.vehicleId} longitude={vehicle.lng} latitude={vehicle.lat} anchor="center">
      <a href="/transit" target="_blank" rel="noopener noreferrer"
        aria-label={`County bus ${vehicle.vehicleId}${vehicle.nextStop ? `, next stop ${vehicle.nextStop.name}` : ""}. Open transit details.`}
        className="grid h-11 w-11 place-items-center rounded-full border-2 border-white bg-[var(--app-cool)] text-white shadow-lg">
        <BusFront className="h-5 w-5" aria-hidden />
      </a>
    </Marker>)}
  </>;
}

/** Opt-in; uses the existing shared poller and stops when the layer closes. */
export default function FairLiveTransit({ condensed = false, hidden = false }: { condensed?: boolean; hidden?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  return <div hidden={hidden}>
    <button type="button" data-fair-map-runtime-control data-fair-transit-toggle aria-label="Live county buses" title="Live county buses" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}
      className={`tap-44 absolute right-[12px] z-10 inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-[8px] rounded-full border bg-[var(--app-bg-elevated-solid)] px-0 text-[clamp(13px,0.8125rem,18px)] font-semibold shadow-[var(--app-elev-2)] sm:left-[12px] sm:right-auto sm:px-[12px] ${condensed ? "top-[116px]" : "top-[8.5rem] sm:top-[11rem]"}`}
      style={{ borderColor: enabled ? "var(--app-cool)" : "var(--app-border)" }}>
      <BusFront className="h-[16px] w-[16px]" aria-hidden /> <span className={condensed ? "sr-only" : "sr-only sm:not-sr-only"}>Live county buses</span>
    </button>
    {enabled ? <LiveLayer condensed={condensed} /> : null}
  </div>;
}
