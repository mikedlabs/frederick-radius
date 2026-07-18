import type { Metadata } from "next";
import { Plane } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import PlanesOverhead from "@/components/overhead/PlanesOverhead";

export const metadata: Metadata = {
  alternates: { canonical: "/overhead" },
  title: "Overhead: planes over Frederick right now",
  description:
    "See aircraft returned by airplanes.live within roughly 60 nautical miles of Frederick, with available route and flight details.",
};

/**
 * /overhead — the live "what's flying over Frederick" map. Aircraft from the
 * free airplanes.live ADS-B feed plotted at their true positions on the
 * Frederick-palette Mapbox base, each with its route (hexdb) + altitude + speed.
 * Client component polls; the page is just the masthead + a frame.
 */
export default function OverheadPage() {
  return (
    <div className="relative space-y-5">
      <PageBloom variant="cool" />

      <header className="pt-0.5">
        <div aria-hidden className="h-px" style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }} />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>Frederick County</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>~60 nm radius</span>
        </div>
        <h1 className="flex items-center gap-2.5 font-serif text-[30px] font-semibold leading-[0.98] tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
          <Plane className="h-7 w-7 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-cool)" }} aria-hidden />
          Overhead
        </h1>
        <p className="mt-2 max-w-prose text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          See what is transmitting over Frederick right now. The nearest
          returned aircraft appear first so likely sightings are easier to find.
        </p>
        <div aria-hidden className="mt-2.5 h-[3px] w-[42px] rounded-full" style={{ background: "var(--app-cool)" }} />
      </header>

      <PlanesOverhead />
    </div>
  );
}
