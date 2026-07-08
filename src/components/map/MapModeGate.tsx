"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

/**
 * MapModeGate — the client-side `?mode=` switch that lets /map be a
 * static (ISR) route.
 *
 * The page used to `await searchParams` to pick between the browse and
 * radius branches, which opted the whole route out of static rendering —
 * every request (worst on the first after a deploy) re-ran the ~10-feed
 * fan-out server-side (~8s TTFB cold). Both branches are now rendered
 * server-side at build/revalidate time and passed in as slots; this gate
 * just picks which one to mount from the live URL.
 *
 * Only the chosen slot MOUNTS (the other is inert flight data), so we
 * never boot two Mapbox instances. Because `useSearchParams` in a static
 * route client-renders up to the nearest <Suspense> boundary, the page
 * wraps this gate in one with a map-shaped skeleton — that skeleton is
 * what the prebuilt HTML carries, and the map itself was always
 * client-only (`ssr: false`) anyway, so no rendered pixels were lost.
 */
export default function MapModeGate({
  browse,
  radius,
}: {
  browse: ReactNode;
  radius: ReactNode;
}) {
  const mode = useSearchParams().get("mode");
  return <>{mode === "radius" ? radius : browse}</>;
}
