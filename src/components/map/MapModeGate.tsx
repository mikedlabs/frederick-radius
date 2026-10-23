"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import MapLoadingScene from "./MapLoadingScene";
import PageBloom from "@/components/ui/PageBloom";

// The default browse entry must not statically import the legacy radius
// interface, its live-bus renderer or its complete static transit datasets.
// next/dynamic starts this import only when the selected branch mounts.
const DeferredRadiusBuilder = dynamic(
  () => import("@/components/radius/DeferredRadiusBuilder"),
  {
    ssr: false,
    loading: () => (
      <div className="relative overflow-hidden" style={{ height: "calc(100dvh - 7.5rem)" }}>
        <MapLoadingScene height="100%" status="The nearby map controls are loading." />
      </div>
    ),
  },
);

/**
 * Keep the browse shell static while honoring the existing ?mode=radius link.
 * Only the selected mode mounts. The radius branch is also a code boundary:
 * a browse visit no longer downloads that inactive interface in its first
 * scripts. The browse map's existing ambient transit preview is unchanged.
 */
export default function MapModeGate({ browse }: { browse: ReactNode }) {
  const mode = useSearchParams().get("mode");
  if (mode !== "radius") return <>{browse}</>;
  return (
    <div className="relative mx-auto max-w-screen-md space-y-3 lg:max-w-screen-lg">
      <PageBloom variant="cool" />
      <DeferredRadiusBuilder />
    </div>
  );
}
