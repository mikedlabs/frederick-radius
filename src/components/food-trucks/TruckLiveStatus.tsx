"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { beaconLabel, readBeacon, type LiveBeacon, type TruckBeacon } from "@/lib/food-trucks/beacon";

/**
 * TruckLiveStatus — the live "this truck is out right now" line, driven by an
 * operator beacon.
 *
 * The /food-trucks page hands down the freshest live beacon it read from the
 * database. That page is only ever a snapshot, so the claim is re-checked here
 * on the visitor's own clock, on mount and every minute: the instant a beacon
 * lapses, `readBeacon` returns null and the live line disappears, falling back
 * to the truck's usual home-base line. A dead beacon can never read as live.
 *
 * Same posture as TruckHomeStatus: nothing live-specific renders during SSR
 * (the fallback shows), then the client fills in the live claim after mount, so
 * hydration stays clean and the honest default leads.
 */
export default function TruckLiveStatus({
  beacon,
  accent,
  children,
}: {
  beacon: TruckBeacon;
  accent: string;
  children?: ReactNode;
}) {
  const [live, setLive] = useState<LiveBeacon | null>(null);

  useEffect(() => {
    const tick = () => setLive(readBeacon(beacon, new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [beacon]);

  if (!live) return <>{children ?? null}</>;

  return (
    <div className="mt-2 space-y-0.5">
      <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--app-positive)" }}>
        <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--app-positive)" }} />
        {beaconLabel(live)}
      </p>
      {live.spot ? (
        <p className="inline-flex flex-wrap items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--app-ink-2)" }}>
          <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: accent }} />
          <span>{live.spot}</span>
        </p>
      ) : null}
      {live.note ? (
        <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {live.note}
        </p>
      ) : null}
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${live.lat},${live.lng}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-44 inline-flex items-center gap-1 text-[11.5px] font-semibold underline"
        style={{ color: accent }}
      >
        Directions
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </a>
    </div>
  );
}
