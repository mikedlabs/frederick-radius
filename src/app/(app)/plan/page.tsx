import type { Metadata } from "next";
import PlanBuilder from "@/components/plan/PlanBuilder";
import { decodeSpec, reconstructPlan } from "@/lib/integrations/planner";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/plan" },
  title: "Plan an outing",
  description:
    "Build an outing from real Frederick County places based on your time and mood.",
  openGraph: {
    title: "Plan an outing in Frederick County",
    description: "Build a route from real Frederick County places.",
  },
};

/** Shared links land on the itinerary. Everyone else gets the compact,
 * constraint-first builder. */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  // A shared plan arrives as ?p=<token>. It is rebuilt server-side
  // from canonical data so the link works without JS and is
  // crawlable. An invalid or stale token falls back to the normal
  // builder.
  const { p } = await searchParams;
  const spec = p ? decodeSpec(p) : null;
  const shared = spec ? reconstructPlan(spec) : null;

  return (
    <div className="relative mx-auto max-w-3xl">
      <PageBloom variant="warm-cool" />

      {!shared && (
        <header className="mb-5 max-w-xl space-y-2">
          <p className="eyebrow" style={{ color: "var(--app-brand)" }}>
            Plan
          </p>
          <h1
            className="font-serif text-[34px] font-semibold leading-[1.02] tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Build a plan that fits.
          </h1>
          <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Choose the area, time, and focus. Radius will only use places that
            fit the schedule.
          </p>
        </header>
      )}

      {shared && spec ? (
        <PlanBuilder initialPlan={shared} initialInputs={spec.i} shared />
      ) : (
        <PlanBuilder />
      )}
    </div>
  );
}
