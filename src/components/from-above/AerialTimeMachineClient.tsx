"use client";

import dynamic from "next/dynamic";

/**
 * Client-only mount for the aerial map — Mapbox touches `window`, so it
 * must not SSR (same pattern as AppMapClient).
 */
const AerialTimeMachine = dynamic(() => import("./AerialTimeMachine"), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-[60vh] place-items-center text-[13px]"
      style={{ color: "var(--app-ink-3)" }}
    >
      Loading the aerials…
    </div>
  ),
});

export default function AerialTimeMachineClient() {
  return <AerialTimeMachine />;
}
