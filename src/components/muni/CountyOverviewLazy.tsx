"use client";

import dynamic from "next/dynamic";

// Client-side wrapper that code-splits CountyOverview (which pulls in
// mapbox-gl ~ 200 kB). Next disallows `ssr: false` in Server Components,
// so the dynamic() call has to live behind this "use client" boundary.
// /about (the only consumer right now) imports THIS, which then loads
// the real map component on the client after the page paints.
const CountyOverview = dynamic(() => import("./CountyOverview"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-[var(--app-radius-lg)] border"
      style={{
        borderColor: "var(--app-border)",
        height: 360,
        background: "var(--app-bg-elevated)",
      }}
    />
  ),
});

export default function CountyOverviewLazy(props: {
  height?: number;
  highlightSlug?: string;
}) {
  return <CountyOverview {...props} />;
}
