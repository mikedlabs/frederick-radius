"use client";

import dynamic from "next/dynamic";

/**
 * Client-only, code-split mount for TransitMap. TransitMap statically
 * imports maplibre-gl (~200 KB+); importing it directly put that weight in
 * the /transit route bundle. Loading it via next/dynamic with ssr:false
 * splits it into its own chunk (same pattern as AppMapClient), so the page
 * shell paints first and maplibre-gl downloads alongside.
 */
const TransitMap = dynamic(() => import("./TransitMap"), {
  ssr: false,
  loading: () => (
    <div
      className="grid w-full place-items-center rounded-[var(--app-radius-lg)] border text-[13px]"
      style={{ height: 380, borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
    >
      Loading the map…
    </div>
  ),
});

export default TransitMap;
