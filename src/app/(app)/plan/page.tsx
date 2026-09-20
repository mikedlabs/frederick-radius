import type { Metadata } from "next";
import PlanBuilder from "@/components/plan/PlanBuilder";
import { decodeSpec, reconstructPlan } from "@/lib/integrations/planner";
import PageBloom from "@/components/ui/PageBloom";
import { PRODUCT_NAMES } from "@/lib/product-names";
import { Suspense } from "react";
import MapReturnLink from "@/components/place/MapReturnLink";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { parseScope, scopeTownSlug } from "@/lib/scope";
import { isDestinationCategory, isRecommendable } from "@/lib/relevance";
import type { PlanInputs } from "@/lib/integrations/planner";
import { normalizeBrowseReturnTo } from "@/lib/browse-return";

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
  searchParams: Promise<{ p?: string; place?: string; in?: string; returnTo?: string }>;
}) {
  // A shared plan arrives as ?p=<token>. It is rebuilt server-side
  // from canonical data so the link works without JS and is
  // crawlable. An invalid or stale token falls back to the normal
  // builder.
  const { p, place: placeSlug, in: scopeParam, returnTo } = await searchParams;
  const spec = p ? decodeSpec(p) : null;
  const shared = spec ? reconstructPlan(spec) : null;
  const place = !p && placeSlug ? clientPlaceBySlug(placeSlug) : null;
  const town = scopeTownSlug(parseScope(scopeParam));
  const seedInputs: PlanInputs = {
    audience: "friends", vibe: "easy", duration_hours: 3,
    ...(town ? { municipality: town } : { max_distance_m: 60_000 }),
    ...(place ? { anchor_slug: place.slug, start_near: place.geom } : {}),
  };
  const seed = place && isDestinationCategory(place.category) && isRecommendable(place) && place.is_operational !== "closed_permanently"
    ? reconstructPlan({ v: 1, i: seedInputs, s: [{ p: place.slug }] })
    : null;
  const initialPlan = shared ?? seed;

  return (
    <div className="relative mx-auto max-w-3xl">
      <PageBloom variant="warm-cool" />

      <Suspense fallback={null}><MapReturnLink /></Suspense>

      {!initialPlan && (
        <header className="mb-5 max-w-xl space-y-2">
          <h1
            className="font-sans text-[34px] font-semibold leading-[1.02] tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Build an outing that fits.
          </h1>
          <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {placeSlug
              ? "This place could not be added in the selected area. You can choose another area or start a new outing."
              : "Choose where and when. Refine the rest only if it matters."}
          </p>
        </header>
      )}

      {shared && spec ? (
        <PlanBuilder initialPlan={shared} initialInputs={spec.i} shared={!normalizeBrowseReturnTo(returnTo)} />
      ) : seed && place ? (
        <PlanBuilder initialPlan={seed} initialInputs={seedInputs} fromPlace={place.name} />
      ) : (
        <PlanBuilder initialInputs={scopeParam ? seedInputs : undefined} />
      )}
    </div>
  );
}
