import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { AdminShell } from "@/components/admin/kit";

/**
 * /admin/basemap — the branded-basemap judge's bench (task #36 spike).
 * Owner call: build the Frederick Radius map style next to the current
 * stock style and decide by eye before anything ships to /map. The maps
 * load client-side only; this page never touches the public map.
 */

export const metadata: Metadata = {
  title: "Basemap spike · Admin",
  robots: { index: false, follow: false },
};

const BasemapCompare = dynamic(() => import("./BasemapCompare"));

export default function BasemapSpikePage() {
  return (
    <AdminShell
      title="Basemap, branded"
      eyebrow="Design spike"
      back={{ href: "/admin", label: "Admin" }}
      intro="The current Mapbox style next to the Frederick Radius flavor on MapLibre and Protomaps. Pan or zoom either pane; the other follows. Nothing here changes the public map."
    >
      <div className="mt-5 space-y-4">
        <BasemapCompare />
        <div
          className="rounded-[var(--app-radius-md)] border p-4 text-[13px] leading-relaxed"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <p>
            What the flavor does: Cream paper ground, Catoctin Forest greens for
            parks and woods, Creek water, Ink labels, and a warm quiet road
            ladder, so the app&apos;s own pins and live layers sit on the map
            instead of fighting it. The proposed pane now runs on our own county
            extract (30 MB, zooms 0 to 15, served from this origin). That is the
            same architecture /map would ship with, ending per-load Mapbox
            billing.
          </p>
          <p className="mt-2">
            <a
              href="/admin/basemap/full"
              className="font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              Open the flavor full screen →
            </a>
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
