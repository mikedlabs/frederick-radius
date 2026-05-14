import type { Metadata } from "next";
import RadiusBuilder from "@/components/radius/RadiusBuilder";
import { PLACES } from "@/data/places";

export const metadata: Metadata = {
  title: "Radius",
  description: "Set a point, set a distance — see everything inside. The Frederick Radius signature interaction.",
};

export default function RadiusPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Signature interaction
        </p>
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Set a point. Set a distance. See what's inside.
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Frederick&apos;s defining interaction — walking from your hotel, driving from a meeting, hiking from a trailhead.
        </p>
      </header>
      <RadiusBuilder places={PLACES} />
    </div>
  );
}
