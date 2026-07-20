/**
 * /api/food-trucks/claim — an operator asks to claim their truck.
 *
 *   POST { truckSlug, operatorName, contact }
 *        → inserts one PENDING food_truck_claims row for the owner to review
 *          in /admin/food-trucks. No token is issued here; approval (owner
 *          action) is what mints the capability token.
 *
 * This is only a REQUEST, so it is county-agnostic and carries no location. It
 * still mirrors the collect route's guards: same-origin only, rate-limited,
 * body-size capped, and it FAILS CLOSED (503) when no database is configured so
 * a misconfigured deploy can never silently swallow requests. The truck must be
 * a real roster slug; the anon key can never write here (RLS deny-all), the
 * only path in is this route on the BYPASSRLS server role.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { food_truck_claims } from "@/lib/db/schema";
import { isFoodTruckSlug } from "@/data/food-trucks";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore() {
  return { "Cache-Control": "no-store" };
}

// A claim request is a few short text fields; there is never a reason for a
// large body here.
const MAX_CLAIM_BODY_BYTES = 16 * 1024;
const CLAIM_RATE_LIMIT = 12;
const CLAIM_RATE_WINDOW_SECONDS = 60 * 60;

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore() });
  }

  if (await isRateLimited(req, "food-truck-claim", CLAIM_RATE_LIMIT, CLAIM_RATE_WINDOW_SECONDS)) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { ...noStore(), "Retry-After": String(CLAIM_RATE_WINDOW_SECONDS) } },
    );
  }

  const rawBody = await readJsonBodyWithLimit(req, MAX_CLAIM_BODY_BYTES);
  if (!rawBody.ok) {
    return NextResponse.json(
      { error: rawBody.error },
      { status: rawBody.error === "body-too-large" ? 413 : 400, headers: noStore() },
    );
  }
  if (typeof rawBody.value !== "object" || rawBody.value === null || Array.isArray(rawBody.value)) {
    return NextResponse.json({ error: "invalid-body" }, { status: 400, headers: noStore() });
  }
  const body = rawBody.value as Record<string, unknown>;

  if (!isFoodTruckSlug(body.truckSlug)) {
    return NextResponse.json({ error: "unknown-truck" }, { status: 400, headers: noStore() });
  }
  const operator_name = clip(body.operatorName, 80);
  const contact = clip(body.contact, 120);
  if (!operator_name || !contact) {
    return NextResponse.json({ error: "missing-fields" }, { status: 400, headers: noStore() });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
  }

  try {
    await db.insert(food_truck_claims).values({
      truck_slug: body.truckSlug,
      operator_name,
      contact,
    });
    return NextResponse.json({ ok: true }, { headers: noStore() });
  } catch {
    return NextResponse.json({ error: "insert-failed" }, { status: 500, headers: noStore() });
  }
}
