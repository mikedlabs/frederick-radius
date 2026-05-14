"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const Map = dynamic(() => import("./PlaceMiniMapInner"), {
  ssr: false,
  loading: () => (
    <div
      className="h-44 w-full animate-pulse rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    />
  ),
});

export default function PlaceMiniMap(props: ComponentProps<typeof Map>) {
  return <Map {...props} />;
}
