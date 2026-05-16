/**
 * Nightly business-status check. For curated places with a google_place_id
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
import { PLACES } from "@/data/places";
import {
  getPlaceDetails,
  googlePlacesConfigured,
  googleStatusToOperational,
} from "@/lib/integrations/google-places";

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

  const targets = PLACES.filter((p) => p.google_place_id).slice(0, BATCH);
  const mismatches: Array<{ slug: string; name: string; current: string; google: string }> = [];

  for (const p of targets) {
    const details = await getPlaceDetails(p.google_place_id as string);
    if (!details) continue;
    const mapped = googleStatusToOperational(details.business_status);
    const current = p.is_operational ?? "operational";
    if (mapped !== "needs_verification" && mapped !== current) {
      mismatches.push({ slug: p.slug, name: p.name, current, google: mapped });
    }
  }

  return NextResponse.json({
    enabled: true,
    checked: targets.length,
    mismatches,
    note: "Add closed places to the denylist or run npm run refresh:business-status to refresh the override.",
  });
}
