"use client";

import { BusFront, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { useLiveVehicles } from "@/components/transit/useLiveVehicles";
import { fairNearbyVehicles } from "@/lib/fair/live-transit";

function LiveLayer() {
  const snapshot = useLiveVehicles();
  const vehicles = fairNearbyVehicles(snapshot);
  const status = !snapshot.loaded ? "Checking County Transit."
    : !snapshot.available || snapshot.stale ? "Live positions are unavailable."
    : vehicles.length === 0 ? "No fresh bus positions near the Fairgrounds."
    : `${vehicles.length} county bus${vehicles.length === 1 ? "" : "es"} nearby now.`;
  return <>
    <div className="absolute bottom-9 left-3 z-10 max-w-[240px] rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] p-3 shadow-[var(--app-elev-2)]" style={{ borderColor: "var(--app-border)" }}>
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
export default function FairLiveTransit() {
  const [enabled, setEnabled] = useState(false);
  return <>
    <button type="button" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}
      className="tap-44 absolute right-3 top-[7.75rem] z-10 inline-flex min-h-11 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated-solid)] px-3 text-[13px] font-semibold shadow-[var(--app-elev-2)] lg:left-3 lg:right-auto lg:top-28"
      style={{ borderColor: enabled ? "var(--app-cool)" : "var(--app-border)" }}>
      <BusFront className="h-4 w-4" aria-hidden /> Live county buses
    </button>
    {enabled ? <LiveLayer /> : null}
  </>;
}
