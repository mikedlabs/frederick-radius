"use client";

import dynamic from "next/dynamic";

import type { FairGroundsMapProps } from "./FairGroundsMapInner";

const FairGroundsMapCanvas = dynamic(() => import("./FairGroundsMapInner"), {
  ssr: false,
  loading: () => (
    <section
      className="mt-5"
      role="status"
      aria-label="Loading the Fair grounds map"
      aria-busy="true"
    >
      <span className="sr-only">Opening the Fair grounds map…</span>
      <p
        className="text-[12px] font-bold uppercase tracking-[0.13em]"
        style={{ color: "var(--app-cool)" }}
      >
        Source-checked grounds map
      </p>
      <h2 className="mt-1 text-[24px] font-extrabold tracking-[-0.035em]">
        Find it before you need it.
      </h2>
      <div className="mt-4 h-12 animate-pulse rounded-[var(--app-radius-lg)] bg-[var(--app-bg-sunken)] motion-reduce:animate-none" />
      <div className="mt-4 flex gap-2 overflow-hidden" aria-hidden>
        <div className="h-11 w-36 shrink-0 animate-pulse rounded-full bg-[var(--app-bg-sunken)] motion-reduce:animate-none" />
        <div className="h-11 w-24 shrink-0 animate-pulse rounded-full bg-[var(--app-bg-sunken)] motion-reduce:animate-none" />
        <div className="h-11 w-28 shrink-0 animate-pulse rounded-full bg-[var(--app-bg-sunken)] motion-reduce:animate-none" />
      </div>
      <div
        className="mt-3 h-[52dvh] min-h-[430px] max-h-[560px] animate-pulse rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-sunken)] motion-reduce:animate-none"
        style={{ borderColor: "var(--app-border-strong)" }}
      />
    </section>
  ),
});

export default function FairGroundsMap(props: FairGroundsMapProps) {
  return (
    <div id="fair-map" className="scroll-mt-4">
      <FairGroundsMapCanvas {...props} />
    </div>
  );
}
