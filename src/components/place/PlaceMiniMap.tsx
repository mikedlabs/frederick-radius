"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import DeferUntilVisible from "@/components/ui/DeferUntilVisible";

const Map = dynamic(() => import("./PlaceMiniMapInner"), {
  ssr: false,
  loading: () => <MiniMapSkeleton />,
});

function MiniMapSkeleton() {
  return (
    <div
      className="h-44 w-full animate-pulse rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    />
  );
}

/**
 * The mini-map sits in the Location section, well below the fold on a
 * place page. Wrapping it in DeferUntilVisible means the mapbox-gl chunk
 * (~200KB+) is NOT downloaded on initial render — it loads only when the
 * user scrolls toward it. The place page paints and becomes interactive
 * without waiting on the map's JS.
 */
export default function PlaceMiniMap(props: ComponentProps<typeof Map>) {
  return (
    <DeferUntilVisible placeholder={<MiniMapSkeleton />} minHeight={176}>
      <Map {...props} />
    </DeferUntilVisible>
  );
}
