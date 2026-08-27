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
import {
  finalizeIdempotentDailyUsage,
  reserveIdempotentDailyUsage,
} from "@/lib/usage-meter";

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
    return NextResponse.json(
      {
        enabled: true,
        error:
          "Google Places runtime is on policy hold or its dedicated credential is missing",
      },
      { status: 500 },
    );
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
  let alreadyClaimed = 0;
  let alreadyCompleted = 0;
  let providerFailures = 0;
  let claimStateFailures = 0;
  const failures: string[] = [];
  let budgetExhausted = false;
  let usageMeterUnavailable = false;

  for (const p of targets) {
    // The per-run batch alone cannot stop a retry or manual invocation from
    // buying the same target twice. Atomically claim this provider identity
    // for the Eastern day while incrementing the shared cap. The digest is
    // durable across serverless workers, so retries and concurrent deliveries
    // cannot both reach Google. Counter uncertainty fails closed.
    const reservation = await reserveIdempotentDailyUsage(
      "budget_google_business_status",
      BATCH,
      p.google_place_id as string,
    );
    if (!reservation) {
      usageMeterUnavailable = true;
      break;
    }
    if (!reservation.reserved) {
      if (reservation.duplicate) {
        alreadyClaimed++;
        if (reservation.duplicateState === "succeeded") {
          alreadyCompleted++;
        } else {
          // Legacy claims and a worker that disappeared mid-request both look
          // pending. Never buy the call again that Eastern day, but also never
          // present that unresolved claim as a healthy status check.
          providerFailures++;
          failures.push(p.slug);
        }
        continue;
      }
      budgetExhausted = true;
      break;
    }
    let details: Awaited<ReturnType<typeof getPlaceDetails>> = null;
    try {
      details = await getPlaceDetails(p.google_place_id as string, "status");
    } catch {
      details = null;
    }
    if (!details) {
      providerFailures++;
      failures.push(p.slug);
      const finalized = await finalizeIdempotentDailyUsage(
        "budget_google_business_status",
        p.google_place_id as string,
        "failed",
      );
      if (!finalized?.finalized) claimStateFailures++;
      continue;
    }
    checked++;
    const mapped = googleStatusToOperational(details.business_status);
    const current = p.is_operational ?? "operational";
    if (mapped !== "needs_verification" && mapped !== current) {
      mismatches.push({ slug: p.slug, name: p.name, current, google: mapped });
    }
    const finalized = await finalizeIdempotentDailyUsage(
      "budget_google_business_status",
      p.google_place_id as string,
      "succeeded",
    );
    if (!finalized?.finalized) claimStateFailures++;
  }

  if (usageMeterUnavailable) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay,
        catalog: allTargets.length,
        checked,
        alreadyClaimed,
        alreadyCompleted,
        providerFailures,
        claimStateFailures,
        budgetExhausted: false,
        usageMeterUnavailable: true,
        mismatches,
        failures: failures.slice(0, 10),
        error:
          "The shared business-status usage counter is unavailable; no Google call ran without an atomic reservation.",
      },
      { status: 503 },
    );
  }

  if (budgetExhausted) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay,
        catalog: allTargets.length,
        checked,
        alreadyClaimed,
        alreadyCompleted,
        providerFailures,
        claimStateFailures,
        budgetExhausted: true,
        usageMeterUnavailable: false,
        mismatches,
        failures: failures.slice(0, 10),
        error:
          `The shared Eastern-day business-status allowance reached ${BATCH}; ` +
          "no unclaimed target was sent to Google without a reservation.",
      },
      { status: 503 },
    );
  }

  if (providerFailures > 0 || claimStateFailures > 0) {
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        cycleDay,
        catalog: allTargets.length,
        checked,
        alreadyClaimed,
        alreadyCompleted,
        providerFailures,
        claimStateFailures,
        budgetExhausted: false,
        usageMeterUnavailable: false,
        mismatches,
        failures: failures.slice(0, 10),
        error:
          providerFailures > 0
            ? `${providerFailures} business-status target${providerFailures === 1 ? "" : "s"} did not return a usable provider result. The daily claims remain closed so a retry cannot repurchase those calls.`
            : "Business-status results were returned, but their durable claim outcomes could not be recorded.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    enabled: true,
    healthy: true,
    cycleDay,
    catalog: allTargets.length,
    checked,
    alreadyClaimed,
    alreadyCompleted,
    providerFailures: 0,
    claimStateFailures: 0,
    budgetExhausted: false,
    usageMeterUnavailable: false,
    mismatches,
    note: "Add closed places to the denylist or run npm run refresh:business-status to refresh the override.",
  });
}
