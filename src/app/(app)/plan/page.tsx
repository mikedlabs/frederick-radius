import type { Metadata } from "next";
import PlanBuilder from "@/components/plan/PlanBuilder";
import { decodeSpec, reconstructPlan } from "@/lib/integrations/planner";
import PageBloom from "@/components/ui/PageBloom";
import { PRODUCT_NAMES } from "@/lib/product-names";

export const metadata: Metadata = {
  alternates: { canonical: "/plan" },
  title: PRODUCT_NAMES.outingPlanner.pageTitle,
  description: PRODUCT_NAMES.outingPlanner.description,
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
          <h1
            className="font-sans text-[34px] font-semibold leading-[1.02] tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Build an outing that fits.
          </h1>
          <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Choose where and when. Refine the rest only if it matters.
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
