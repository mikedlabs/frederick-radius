import type { Metadata } from "next";
import PlanBuilder from "@/components/plan/PlanBuilder";

export const metadata: Metadata = {
  title: "Plan my evening",
  description: "Tell us how much time you've got and the vibe — we'll string together verified Frederick County stops.",
};

export default function PlanPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Itinerary builder · verified places only
        </p>
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Plan my evening.
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Tell us how much time you've got, who you're with, and the vibe. We'll stitch together stops you can actually
          do — every recommendation is from our verified list.
        </p>
      </header>
      <PlanBuilder />
    </div>
  );
}
