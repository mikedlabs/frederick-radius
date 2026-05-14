"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const AppMap = dynamic(() => import("./AppMap"), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-[60vh] place-items-center rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p className="text-sm" style={{ color: "var(--app-ink-3)" }}>Loading map…</p>
    </div>
  ),
});

export default function AppMapClient(props: ComponentProps<typeof AppMap>) {
  return <AppMap {...props} />;
}
