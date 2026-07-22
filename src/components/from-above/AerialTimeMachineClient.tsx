"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";

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
  if (!CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED) {
    return (
      <main
        className="grid min-h-dvh place-items-center px-6 py-16"
        style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}
      >
        <section className="w-full max-w-md space-y-4 text-center">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            From above
          </p>
          <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-tight">
            The aerial archive is not available right now.
          </h1>
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Frederick Radius is reviewing permission for this historical-imagery
            experiment. The independently photographed From Above collection is
            still available.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              href="/from-above/preview"
              className="rounded-full px-4 py-2 text-[13px] font-semibold"
              style={{ background: "var(--app-brand)", color: "white" }}
            >
              View From Above
            </Link>
            <Link
              href="/compass"
              className="rounded-full border px-4 py-2 text-[13px] font-semibold"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            >
              Back to all tools
            </Link>
          </div>
        </section>
      </main>
    );
  }
  return <AerialTimeMachine />;
}
