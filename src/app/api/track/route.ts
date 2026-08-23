/**
 * POST /api/track — member activity plus a privacy-safe decision rollup.
 *
 * The public analytics ingest for NFC members. It copies the security posture of
 * /api/collect exactly: same-origin only, per-IP rate limit, a hard body-size
 * cap read before any work, then strict validation. The six canonical decision
 * events also increment an anonymous daily counter with fixed categorical
 * dimensions only. That rollup never stores a visitor/member id, entity slug,
 * route, query, answer, IP, coordinates, or free text.
 *
 * Existing member-linked behavior remains: identity comes from the signed
 * httpOnly `fr_member` cookie, never the body, and non-decision events from a
 * visitor without a member cookie are dropped. Client and persisted member
 * opt-outs stop both writes. Anonymous aggregate failures are fail-soft;
 * a valid member still receives the existing 503 when the DB is unavailable.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  decision_daily_aggregates,
  nfc_events,
  nfc_members,
} from "@/lib/db/schema";
import { verifyMemberCookie } from "@/lib/beta-gate";
import {
  ANALYTICS_OPTOUT_COOKIE,
  MEMBER_COOKIE,
} from "@/lib/nfc-constants";
import { parseDecisionAggregateEvent } from "@/lib/decision/telemetry";
import { easternDayKey } from "@/lib/tz";
import { recordSearchMiss } from "@/lib/telemetry/searchMiss";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

// Events are tiny (a name, a path, a handful of small props). A hard 4 KiB cap
// stops oversized parser work before any DB touch.
const MAX_TRACK_BODY_BYTES = 4 * 1024;
// page_view fires per navigation, so the ceiling is generous while still bounding
// a leaked-cookie flood: 300 events/min per IP.
const TRACK_RATE_LIMIT = 300;
const TRACK_RATE_WINDOW_SECONDS = 60;
const MAX_EVENT_LEN = 64;
const MAX_PATH_LEN = 256;
const MAX_PROP_KEYS = 24;
const MAX_PROP_STR_LEN = 200;

// Event names are code-defined slugs (map_pin, page_view, ask_submit, …), never
// user text. Bounding them to this charset stops a member from writing arbitrary
// strings into their own per-card log (a member can only ever write to its own
// id, so the blast radius is self-poisoning, but a sane shape costs nothing).
const SAFE_EVENT_RE = /^[a-z0-9_]{1,64}$/;

// Prop VALUES in this codebase are usually categorical (a craving key, a source,
// an on/off flag). Search and Ask misses can carry raw text, which must never
// land in this member-linked log or in Plausible. track() sends only stable goal
// names to Plausible; this second guard drops sensitive keys before any insert.
const SENSITIVE_PROP_KEYS = new Set([
  "query",
  "q",
  "answer",
  "text",
  "message",
  "note",
  "name",
  "email",
  "contact",
  "address",
]);

/** 204: accepted-or-dropped. The client fire-and-forgets, so a silent drop and a
 *  successful insert are indistinguishable by design (no member enumeration). */
function drop(): NextResponse {
  return new NextResponse(null, { status: 204, headers: noStore });
}

/** Keep only a flat object of string|number|boolean props, clipped and key-capped.
 *  Nested/array/null values are dropped rather than rejecting the whole event. */
function sanitizeProps(input: unknown): Record<string, string | number | boolean> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const out: Record<string, string | number | boolean> = {};
  let n = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (n >= MAX_PROP_KEYS) break;
    if (key.length === 0 || key.length > MAX_EVENT_LEN) continue;
    // Never persist a free-text key to the member-linked log (search/Ask query).
    if (SENSITIVE_PROP_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === "string") {
      out[key] = value.slice(0, MAX_PROP_STR_LEN);
      n++;
    } else if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") {
      out[key] = value;
      n++;
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  // 1. Same-origin: reject a cross-site or header-forged POST outright.
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore });
  }

  // 2. Rate-limit before reading the body or touching Postgres.
  if (await isRateLimited(req, "track-ingest", TRACK_RATE_LIMIT, TRACK_RATE_WINDOW_SECONDS)) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { ...noStore, "Retry-After": String(TRACK_RATE_WINDOW_SECONDS) } },
    );
  }

  // 3. Body-size cap: stop reading the moment the ceiling is crossed.
  const rawBody = await readJsonBodyWithLimit(req, MAX_TRACK_BODY_BYTES);
  if (!rawBody.ok) {
    return NextResponse.json(
      { error: rawBody.error },
      { status: rawBody.error === "body-too-large" ? 413 : 400, headers: noStore },
    );
  }
  if (typeof rawBody.value !== "object" || rawBody.value === null || Array.isArray(rawBody.value)) {
    return NextResponse.json({ error: "invalid-body" }, { status: 400, headers: noStore });
  }
  const body = rawBody.value as Record<string, unknown>;

  // 4. Strict validation of the event shape. Names must be code-defined slugs;
  //    anything else (arbitrary text, punctuation) is rejected outright.
  const event = typeof body.event === "string" ? body.event.trim().slice(0, MAX_EVENT_LEN) : "";
  if (!SAFE_EVENT_RE.test(event)) {
    return NextResponse.json({ error: "invalid-event" }, { status: 400, headers: noStore });
  }
  const path =
    typeof body.path === "string" && body.path.trim()
      ? body.path.trim().slice(0, MAX_PATH_LEN)
      : null;
  const props = body.props === undefined ? null : sanitizeProps(body.props);

  // The public aggregate accepts exactly the canonical decision contract. An
  // event in the reserved decision namespace with arbitrary dimensions is a
  // bad request, not a value to clean or bucket after the fact.
  const decisionAggregate = parseDecisionAggregateEvent(event, body.props);
  if (event.startsWith("decision_") && !decisionAggregate) {
    return NextResponse.json(
      { error: "invalid-decision-event" },
      { status: 400, headers: noStore },
    );
  }

  // Defense in depth: the client normally never sends after opt-out, but the
  // server honors the cookie even if a script replays the request directly.
  if (req.cookies.get(ANALYTICS_OPTOUT_COOKIE)?.value === "1") return drop();

  const rawProps =
    typeof body.props === "object" && body.props !== null && !Array.isArray(body.props)
      ? body.props as Record<string, unknown>
      : null;
  const searchMissQuery =
    event === "search_empty" && typeof rawProps?.query === "string"
      ? rawProps.query
      : null;

  // 5. Identity from the signed cookie only. Anonymous decision events may
  //    reach the aggregate. A settled anonymous search miss retains its
  //    privacy-safe data-gap write, but a signed member must pass the
  //    authoritative persisted opt-out check before that write can occur.
  const memberId = await verifyMemberCookie(req.cookies.get(MEMBER_COOKIE)?.value);
  if (!memberId && searchMissQuery) {
    await recordSearchMiss(searchMissQuery, "search");
    return drop();
  }
  if (!memberId && !decisionAggregate) return drop();

  // 6. A missing DB still fails closed for a valid member (existing contract),
  //    while anonymous measurement stays invisible and fail-soft.
  const db = getDb();
  if (!db) {
    return memberId
      ? NextResponse.json(
          { error: "database-unavailable" },
          { status: 503, headers: noStore },
        )
      : drop();
  }

  // A persisted member opt-out is authoritative for both member activity and
  // the anonymous rollup. Check it before either write.
  if (memberId) {
    try {
      const member = (
        await db
          .select({ opted_out: nfc_members.opted_out })
          .from(nfc_members)
          .where(eq(nfc_members.id, memberId))
          .limit(1)
      )[0];
      if (!member || member.opted_out) return drop();
    } catch {
      return drop();
    }
  }

  // SearchOverlay emits only after a stable zero-result state. Bank the miss
  // after both consent layers have passed. The raw query remains excluded from
  // the member-linked event log and Plausible.
  if (searchMissQuery) {
    await recordSearchMiss(searchMissQuery, "search");
  }

  if (decisionAggregate) {
    try {
      await db
        .insert(decision_daily_aggregates)
        .values({
          day: easternDayKey(new Date()),
          surface: decisionAggregate.surface,
          stage: decisionAggregate.stage,
          entity_kind: decisionAggregate.entityKind,
          position: decisionAggregate.position,
          action: decisionAggregate.action,
          count: 1,
        })
        .onConflictDoUpdate({
          target: [
            decision_daily_aggregates.day,
            decision_daily_aggregates.surface,
            decision_daily_aggregates.stage,
            decision_daily_aggregates.entity_kind,
            decision_daily_aggregates.position,
            decision_daily_aggregates.action,
          ],
          set: {
            count: sql`${decision_daily_aggregates.count} + 1`,
            updated_at: new Date(),
          },
        });
    } catch {
      // Analytics is not product state. A missing migration or transient
      // counter failure must not break the visitor's action or member logging.
    }
  }

  if (!memberId) return drop();

  try {
    await db.insert(nfc_events).values({
      member_id: memberId,
      event,
      path: path ?? undefined,
      props: props ?? undefined,
    });
  } catch {
    // Never throw into product; a transient failure just loses one member event.
    return drop();
  }
  return drop();
}
