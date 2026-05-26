import type { Metadata } from "next";
import PlanBuilder from "@/components/plan/PlanBuilder";
import { decodeSpec, reconstructPlan } from "@/lib/integrations/planner";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  title: "Plan an evening",
  description:
    "Tell us how much time you've got and the vibe. We'll string together real Frederick County stops, nothing invented.",
  openGraph: {
    title: "Plan an evening in Frederick County",
    description: "Real places, stitched into a plan you can actually do.",
  },
};

/**
 * /plan — the itinerary builder.
 *
 * Redesigned mobile-first. The page opens with an atmospheric
 * Frederick County photograph (SeasonalPhoto, swaps with the
 * season) and an editorial headline. Below: the builder itself,
 * which leads with **VIBE cards** as the primary call-to-action
 * (five big colored chips that pick the mood AND build a plan in
 * one tap), then secondary preset cards for curated combos, then a
 * "Customize" door that opens a Vaul drawer for audience/duration/
 * start-time refinements. Casual users get to a plan in 1 tap;
 * power users still have full control.
 *
 * Shared plans (?p=) skip the empty hero copy and land directly on
 * the rebuilt plan so the share link reads as "open the plan,"
 * not "start over."
 */
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
    <div className="relative">
      <PageBloom variant="warm-cool" />

      {!shared && (
        <header className="relative -mx-4 mb-5 overflow-hidden sm:mx-0 sm:rounded-[var(--app-radius-lg)]">
          {/* Atmospheric Frederick photo — sets the mood before any
              UI loads. Aspect-locked so the rest of the page doesn't
              jump on first paint; falls back to a quiet gradient if
              the seasonal manifest hasn't been generated yet. */}
          <div className="relative h-44 w-full sm:h-52" aria-hidden>
            <SeasonalPhoto
              season="auto"
              alt=""
              priority
              sizes="(max-width: 768px) 100vw, 640px"
              className="absolute inset-0"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.18) 55%, transparent 90%)",
              }}
            />
          </div>
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 sm:p-5">
            <p className="eyebrow text-white/85">
              Itinerary builder · real Frederick places
            </p>
            <h1 className="font-serif text-[34px] font-semibold leading-[1.02] tracking-tight text-white">
              Plan an evening.
            </h1>
          </div>
        </header>
      )}

      {shared && (
        <header className="mb-5 space-y-2">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            A shared plan
          </p>
          <h1
            className="font-serif text-[30px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            A plan, ready to run.
          </h1>
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            Someone shared this Frederick County plan with you. Open any
            stop, get directions, or make it your own.
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
