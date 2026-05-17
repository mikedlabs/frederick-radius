import type { Metadata } from "next";
import PlanBuilder from "@/components/plan/PlanBuilder";

export const metadata: Metadata = {
  title: "Plan my evening",
  description: "Tell us how much time you've got and the vibe — we'll string together real Frederick County stops, nothing invented.",
};

export default function PlanPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Itinerary builder · real places, nothing invented
        </p>
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Plan my evening.
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Tell us how much time you&apos;ve got, who you&apos;re with, and the vibe. We&apos;ll stitch together stops you can actually
          do — every recommendation is a real place from our directory.
        </p>
      </header>
      <PlanBuilder />
    </div>
  );
}
