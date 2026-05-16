"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const Map = dynamic(() => import("./EventsMapInner"), {
  ssr: false,
  loading: () => (
    <div
      className="h-[460px] w-full animate-pulse rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    />
  ),
});

export default function EventsMap(props: ComponentProps<typeof Map>) {
  return <Map {...props} />;
}
