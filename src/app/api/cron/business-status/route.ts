/**
 * Nightly business-status check. For canonical public places with a
 * google_place_id
 * it compares Google's businessStatus to our is_operational and reports
 * mismatches (newly closed places to add to the denylist or the
 * business-status override). It reports, it does not persist: serverless
 * storage is read-only, same as the data-health cron.
 *
 * PAID and OFF by default. Each run makes Google Place Details calls, so
 * the handler no-ops unless BUSINESS_STATUS_CRON is "1". This ships the
 * mechanism without incurring spend until it is explicitly enabled. The
 * batch is capped per run to bound cost (staggering across runs covers
 * the catalog over time). Cost is documented in README.md.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import {
  canonicalBusinessStatusRefreshCandidates,
  decoratePlace,
} from "@/lib/loaders/places";
import { isValidCoord } from "@/lib/geo";
import {
  getPlaceDetails,
  googlePlacesConfigured,
  googleStatusToOperational,
} from "@/lib/integrations/google-places";
import { selectRotatingStatusTargets } from "@/lib/business-status-refresh";
import { findGooglePlaceIdCollisions } from "@/lib/quality/enrichmentBinding";
import { isGooglePlaceId } from "@/lib/provenance";
import { reserveDailyUsage } from "@/lib/usage-meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 40;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (process.env.BUSINESS_STATUS_CRON !== "1") {
    return NextResponse.json({
      enabled: false,
      note: "Set BUSINESS_STATUS_CRON=1 to enable. Off by default to avoid Google Places spend.",
    });
  }
  if (!googlePlacesConfigured()) {
    return NextResponse.json({ enabled: true, error: "GOOGLE_PLACES_API_KEY not set" }, { status: 500 });
  }

  const allTargets = canonicalBusinessStatusRefreshCandidates()
    .map((place) => decoratePlace(place))
    .filter(
      (place) =>
        isValidCoord(place.geom) &&
        isGooglePlaceId(place.google_place_id),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const identityCollisions = findGooglePlaceIdCollisions(allTargets);
  if (identityCollisions.length > 0) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        catalog: allTargets.length,
        error:
          `Refusing paid business-status calls for duplicate provider identities:\n${identityCollisions
            .map(
              ({ googlePlaceId, slugs }) =>
                `${googlePlaceId}: ${slugs.join(", ")}`,
            )
            .join("\n")}`,
      },
      { status: 503 },
    );
  }
  const cycleDay = Math.floor(Date.now() / 86_400_000);
  const targets = selectRotatingStatusTargets(allTargets, BATCH, cycleDay);
  const mismatches: Array<{ slug: string; name: string; current: string; google: string }> = [];
  let checked = 0;
  let budgetExhausted = false;
  let usageMeterUnavailable = false;

  for (const p of targets) {
    // The per-run batch alone cannot stop a retry or manual invocation from
    // buying the same calls twice. Every invocation shares one Eastern-day
    // allowance, and counter uncertainty fails closed.
    const reservation = await reserveDailyUsage(
      "budget_google_business_status",
      BATCH,
    );
    if (!reservation) {
      usageMeterUnavailable = true;
      break;
    }
    if (!reservation.reserved) {
      budgetExhausted = true;
      break;
    }
    checked++;
    const details = await getPlaceDetails(p.google_place_id as string, "status");
    if (!details) continue;
    const mapped = googleStatusToOperational(details.business_status);
    const current = p.is_operational ?? "operational";
    if (mapped !== "needs_verification" && mapped !== current) {
      mismatches.push({ slug: p.slug, name: p.name, current, google: mapped });
    }
  }

  if (usageMeterUnavailable) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay,
        catalog: allTargets.length,
        checked,
        budgetExhausted: false,
        usageMeterUnavailable: true,
        mismatches,
        error:
          "The shared business-status usage counter is unavailable; no Google call ran without an atomic reservation.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    enabled: true,
    cycleDay,
    catalog: allTargets.length,
    checked,
    budgetExhausted,
    usageMeterUnavailable: false,
    mismatches,
    note: "Add closed places to the denylist or run npm run refresh:business-status to refresh the override.",
  });
}
