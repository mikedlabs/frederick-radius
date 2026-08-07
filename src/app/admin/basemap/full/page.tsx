import type { Metadata } from "next";
import dynamic from "next/dynamic";

/**
 * /admin/basemap/full — the flavor at full bleed (task #36).
 * The bench answers "which is better"; this answers "does it feel like
 * Frederick Radius owns the map" at the size users actually hold.
 */

export const metadata: Metadata = {
  title: "Basemap flavor, full screen · Admin",
  robots: { index: false, follow: false },
};

const FullFlavorPreview = dynamic(() => import("./FullFlavorPreview"));

export default function BasemapFullPreviewPage() {
  return (
    <main aria-label="Frederick Radius basemap flavor, full screen">
      <h1 className="sr-only">Basemap flavor, full screen</h1>
      <FullFlavorPreview />
    </main>
  );
}
