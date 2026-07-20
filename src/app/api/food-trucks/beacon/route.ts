/**
 * /api/food-trucks/beacon — the token-gated operator beacon write + read.
 *
 *   POST   { token, truckSlug, lat, lng, spot?, note?, until? }
 *          → drop a live beacon. `until` (ISO) is the operator's stated close
 *            time; the server CAPS it (max 8 hours out) so a beacon can never
 *            linger. Returns { ok, id, expiresAt }.
 *   DELETE { token, truckSlug }
 *          → "I'm packing up": expire this truck's live beacon(s) now.
 *   GET    ?token=…
 *          → resolve a token to its truck + current live beacon, so the
 *            operator drop page can confirm identity and show live status.
 *
 * SECURITY MODEL — this is a PUBLIC endpoint, so it fails closed at every step:
 *   1. Writes are same-origin only, rate-limited, and body-size capped BEFORE
 *      any database work (mirrors /api/collect).
 *   2. Every write requires a `token` that matches an APPROVED food_truck_claims
 *      row for the EXACT truck_slug. The token is a 192-bit opaque credential
 *      the owner issued on approval; there is no other way to authenticate. A
 *      forged, wrong, or wrong-truck token resolves to no row and is rejected
 *      401. No env passcode exists to leak — the DB-issued token IS the secret,
 *      and RLS deny-all means the anon key can never touch these tables.
 *   3. Coordinates are county-locked (Frederick bounds); expires_at is capped
 *      server-side. When no database is configured the route returns 503.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { food_truck_beacons, food_truck_claims } from "@/lib/db/schema";
import { FOOD_TRUCK_BY_SLUG, isFoodTruckSlug } from "@/data/food-trucks";
import { isInFrederickCounty } from "@/components/map/constants";
import { resolveBeaconWindow } from "@/lib/food-trucks/beaconWindow";
import { looksLikeBeaconToken } from "@/lib/food-trucks/token";
import { beaconLabel, readBeacon, type TruckBeacon } from "@/lib/food-trucks/beacon";
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

// A beacon is a pin plus a couple of short text fields; there is never a reason
// for a large body here.
const MAX_BEACON_BODY_BYTES = 16 * 1024;
// One operator drops / re-drops / ends across a shift. 60/hour is generous for
// a real operator while bounding a leaked token's blast radius.
const BEACON_RATE_LIMIT = 60;
const BEACON_READ_RATE_LIMIT = 120;
const BEACON_RATE_WINDOW_SECONDS = 60 * 60;

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

type WriteBody =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/** Origin, abuse, size, and shape checks for a write — the same order and
 *  posture as /api/collect, run before any database work. Auth (the token) is
 *  checked by the caller once the DB is in hand. */
async function readWriteBody(req: NextRequest): Promise<WriteBody> {
  if (!isSameOriginMutationRequest(req)) {
    return { ok: false, response: NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore() }) };
  }
  if (await isRateLimited(req, "food-truck-beacon", BEACON_RATE_LIMIT, BEACON_RATE_WINDOW_SECONDS)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate-limited" },
        { status: 429, headers: { ...noStore(), "Retry-After": String(BEACON_RATE_WINDOW_SECONDS) } },
      ),
    };
  }
  const rawBody = await readJsonBodyWithLimit(req, MAX_BEACON_BODY_BYTES);
  if (!rawBody.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: rawBody.error },
        { status: rawBody.error === "body-too-large" ? 413 : 400, headers: noStore() },
      ),
    };
  }
  if (typeof rawBody.value !== "object" || rawBody.value === null || Array.isArray(rawBody.value)) {
    return { ok: false, response: NextResponse.json({ error: "invalid-body" }, { status: 400, headers: noStore() }) };
  }
  return { ok: true, body: rawBody.value as Record<string, unknown> };
}

/**
 * The one authorization check: does `token` name an APPROVED claim for this
 * exact truck? A forged token (or a valid token pointed at the wrong truck)
 * matches no row and returns false, which the callers turn into a 401.
 */
async function isApprovedForTruck(
  db: NonNullable<ReturnType<typeof getDb>>,
  token: string,
  truckSlug: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: food_truck_claims.id })
    .from(food_truck_claims)
    .where(
      and(
        eq(food_truck_claims.token, token),
        eq(food_truck_claims.truck_slug, truckSlug),
        eq(food_truck_claims.status, "approved"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

const badToken = () => NextResponse.json({ error: "bad-token" }, { status: 401, headers: noStore() });
const unknownTruck = () => NextResponse.json({ error: "unknown-truck" }, { status: 400, headers: noStore() });
const noDb = () => NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });

export async function POST(req: NextRequest) {
  const parsed = await readWriteBody(req);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed;

  // Reject an obviously-bogus token before any DB work; a well-shaped fake
  // still gets rejected below when it matches no approved claim.
  if (!looksLikeBeaconToken(body.token)) return badToken();
  if (!isFoodTruckSlug(body.truckSlug)) return unknownTruck();

  const lng = Number(body.lng);
  const lat = Number(body.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "invalid-coords" }, { status: 400, headers: noStore() });
  }
  if (!isInFrederickCounty(lng, lat)) {
    return NextResponse.json({ error: "out-of-bounds" }, { status: 400, headers: noStore() });
  }

  const spot = clip(body.spot, 80);
  const note = clip(body.note, 160);

  const db = getDb();
  if (!db) return noDb();

  let authorized: boolean;
  try {
    authorized = await isApprovedForTruck(db, body.token, body.truckSlug);
  } catch {
    return NextResponse.json({ error: "lookup-failed" }, { status: 500, headers: noStore() });
  }
  if (!authorized) return badToken();

  const { startedAt, expiresAt } = resolveBeaconWindow(new Date(), body.until);
  try {
    const [row] = await db
      .insert(food_truck_beacons)
      .values({
        truck_slug: body.truckSlug,
        lat,
        lng,
        spot: spot ?? undefined,
        note: note ?? undefined,
        started_at: startedAt,
        expires_at: expiresAt,
      })
      .returning({ id: food_truck_beacons.id });
    return NextResponse.json(
      { ok: true, id: row?.id, expiresAt: expiresAt.toISOString() },
      { headers: noStore() },
    );
  } catch {
    return NextResponse.json({ error: "insert-failed" }, { status: 500, headers: noStore() });
  }
}

export async function DELETE(req: NextRequest) {
  const parsed = await readWriteBody(req);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed;

  if (!looksLikeBeaconToken(body.token)) return badToken();
  if (!isFoodTruckSlug(body.truckSlug)) return unknownTruck();

  const db = getDb();
  if (!db) return noDb();

  let authorized: boolean;
  try {
    authorized = await isApprovedForTruck(db, body.token, body.truckSlug);
  } catch {
    return NextResponse.json({ error: "lookup-failed" }, { status: 500, headers: noStore() });
  }
  if (!authorized) return badToken();

  const now = new Date();
  try {
    // Expire every still-live beacon for this truck now. A dead beacon read is
    // the same as an absent one, so this takes the truck off the map at once.
    const rows = await db
      .update(food_truck_beacons)
      .set({ expires_at: now })
      .where(and(eq(food_truck_beacons.truck_slug, body.truckSlug), gt(food_truck_beacons.expires_at, now)))
      .returning({ id: food_truck_beacons.id });
    return NextResponse.json({ ok: true, ended: rows.length }, { headers: noStore() });
  } catch {
    return NextResponse.json({ error: "update-failed" }, { status: 500, headers: noStore() });
  }
}

export async function GET(req: NextRequest) {
  if (await isRateLimited(req, "food-truck-beacon-read", BEACON_READ_RATE_LIMIT, BEACON_RATE_WINDOW_SECONDS)) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { ...noStore(), "Retry-After": String(BEACON_RATE_WINDOW_SECONDS) } },
    );
  }
  const token = new URL(req.url).searchParams.get("token");
  if (!looksLikeBeaconToken(token)) return badToken();

  const db = getDb();
  if (!db) return noDb();

  let claim: { truck_slug: string } | undefined;
  try {
    [claim] = await db
      .select({ truck_slug: food_truck_claims.truck_slug })
      .from(food_truck_claims)
      .where(and(eq(food_truck_claims.token, token), eq(food_truck_claims.status, "approved")))
      .limit(1);
  } catch {
    return NextResponse.json({ error: "lookup-failed" }, { status: 500, headers: noStore() });
  }
  if (!claim) return badToken();

  const truck = FOOD_TRUCK_BY_SLUG.get(claim.truck_slug);
  const now = new Date();
  let live: {
    spot: string | null;
    note: string | null;
    minsLeft: number;
    phase: "out" | "wrapping";
    label: string;
    expiresAt: string;
  } | null = null;
  try {
    const [row] = await db
      .select({
        lat: food_truck_beacons.lat,
        lng: food_truck_beacons.lng,
        spot: food_truck_beacons.spot,
        note: food_truck_beacons.note,
        started_at: food_truck_beacons.started_at,
        expires_at: food_truck_beacons.expires_at,
      })
      .from(food_truck_beacons)
      .where(and(eq(food_truck_beacons.truck_slug, claim.truck_slug), gt(food_truck_beacons.expires_at, now)))
      .orderBy(desc(food_truck_beacons.started_at))
      .limit(1);
    if (row) {
      const tb: TruckBeacon = {
        truckSlug: claim.truck_slug,
        lat: row.lat,
        lng: row.lng,
        spot: row.spot ?? undefined,
        note: row.note ?? undefined,
        startedAt: row.started_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
      };
      const resolved = readBeacon(tb, now);
      if (resolved) {
        live = {
          spot: resolved.spot ?? null,
          note: resolved.note ?? null,
          minsLeft: resolved.minsLeft,
          phase: resolved.phase,
          label: beaconLabel(resolved),
          expiresAt: tb.expiresAt,
        };
      }
    }
  } catch {
    // A read failure just means "no live layer" — identity still resolves.
  }

  return NextResponse.json(
    { ok: true, truckSlug: claim.truck_slug, truckName: truck?.name ?? claim.truck_slug, live },
    { headers: noStore() },
  );
}
