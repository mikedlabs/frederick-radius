import type { Metadata } from "next";
import PlanBuilder from "@/components/plan/PlanBuilder";
import { decodeSpec, reconstructPlan } from "@/lib/integrations/planner";

export const metadata: Metadata = {
  title: "Plan my evening",
  description:
    "Tell us how much time you've got and the vibe. We'll string together real Frederick County stops, nothing invented.",
};

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  // A shared plan arrives as ?p=<token>. It is rebuilt server-side from
  // canonical data so the link works without JS and is crawlable. An
  // invalid or stale token falls back to the normal builder.
  const { p } = await searchParams;
  const spec = p ? decodeSpec(p) : null;
  const shared = spec ? reconstructPlan(spec) : null;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Itinerary builder · real places, nothing invented
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          {shared ? "A plan, ready to run." : "Plan my evening."}
        </h1>
        <p className="text-[15px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          {shared ? (
            "Someone shared this Frederick County plan. Open any stop, get directions, or make it your own."
          ) : (
            <>
              Tell us how much time you&apos;ve got, who you&apos;re with, and the vibe. We&apos;ll stitch together
              stops you can actually do. Every recommendation is a real place from our directory.
            </>
          )}
        </p>
      </header>
      {shared && spec ? (
        <PlanBuilder initialPlan={shared} initialInputs={spec.i} shared />
      ) : (
        <PlanBuilder />
      )}
    </div>
  );
}
