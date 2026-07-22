/**
 * POST /api/track — the first-party per-member event log.
 *
 * The public analytics ingest for NFC members. It copies the security posture of
 * /api/collect exactly: same-origin only, per-IP rate limit, a hard body-size cap
 * read before any work, then strict validation. Identity comes from the signed
 * httpOnly `fr_member` cookie, never the body, so a caller can only ever log
 * against its own member id. A request with no or invalid member cookie, or from
 * a member who opted out, is DROPPED with 204 (analytics must never error into
 * the product, and a silent drop reveals nothing about which members exist). It
 * FAILS CLOSED with 503 when the database is unconfigured.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { nfc_events, nfc_members } from "@/lib/db/schema";
import { verifyMemberCookie } from "@/lib/beta-gate";
import { MEMBER_COOKIE } from "@/lib/nfc-constants";
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

  // 5. Identity from the signed cookie only. No member → drop silently (the
  //    common case for the non-NFC public; it must never surface an error).
  const memberId = await verifyMemberCookie(req.cookies.get(MEMBER_COOKIE)?.value);
  if (!memberId) return drop();

  // 6. Fail closed: no database means we cannot record the event.
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore });
  }

  try {
    // Confirm the member exists and has not opted out; both gate the write.
    const member = (
      await db
        .select({ opted_out: nfc_members.opted_out })
        .from(nfc_members)
        .where(eq(nfc_members.id, memberId))
        .limit(1)
    )[0];
    if (!member || member.opted_out) return drop();

    await db.insert(nfc_events).values({
      member_id: memberId,
      event,
      path: path ?? undefined,
      props: props ?? undefined,
    });
  } catch {
    // Never throw into product; a transient failure just loses one event.
    return drop();
  }
  return drop();
}
