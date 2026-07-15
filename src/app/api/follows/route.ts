import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { follows, user_profiles } from "@/lib/db/schema";
import { getServerUserId } from "@/lib/auth";
import {
  hasJsonContentType,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

/**
 * /api/follows — user's follow relationships to places.
 *
 *   GET    → { slugs: string[] }  the user's current follow set
 *   POST   { slug, source? }       add a follow (idempotent)
 *   DELETE { slug }                remove a follow
 *
 * All three require an authenticated session. Unauthenticated callers
 * get a 401 — the client-side useFollows hook treats that as "fall
 * back to localStorage" rather than as an error to surface.
 *
 * Place slugs are NOT validated against the static catalog here. The
 * runtime catalog (places-dfp.json + curated seeds) is the source of
 * truth for which slugs are real, but it's a large file we don't want
 * to import into every API route invocation. A follow on a non-real
 * slug is harmless — it'll simply never resolve to a card.
 */

function noStore() {
  return { "Cache-Control": "no-store" };
}

async function readMutationBody(req: NextRequest): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  if (!isSameOriginMutationRequest(req)) {
    return { ok: false, response: NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore() }) };
  }
  if (!hasJsonContentType(req)) {
    return { ok: false, response: NextResponse.json({ error: "content-type" }, { status: 415, headers: noStore() }) };
  }
  const parsed = await readJsonBodyWithLimit(req, 2_048);
  if (!parsed.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: parsed.error },
        { status: parsed.error === "body-too-large" ? 413 : 400, headers: noStore() },
      ),
    };
  }
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return { ok: false, response: NextResponse.json({ error: "invalid-body" }, { status: 400, headers: noStore() }) };
  }
  return { ok: true, body: parsed.value as Record<string, unknown> };
}

async function requireUser(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const userId = await getServerUserId();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthenticated" },
        { status: 401, headers: noStore() },
      ),
    };
  }
  return { ok: true, userId };
}

function requireDb():
  | { ok: true; db: ReturnType<typeof getDb> & {} }
  | { ok: false; response: NextResponse } {
  const db = getDb();
  if (!db) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "database-unavailable" },
        { status: 503, headers: noStore() },
      ),
    };
  }
  return { ok: true, db };
}

/** Ensure a user_profiles row exists. Defensive — the auth callback
 *  upserts on first sign-in, but we don't want a missing row to break
 *  the first /api/follows write. ON CONFLICT DO NOTHING is cheap. */
async function ensureProfile(userId: string) {
  const db = getDb();
  if (!db) return;
  await db
    .insert(user_profiles)
    .values({ id: userId })
    .onConflictDoNothing({ target: user_profiles.id });
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const dbr = requireDb();
  if (!dbr.ok) return dbr.response;

  const rows = await dbr.db
    .select({ slug: follows.place_slug })
    .from(follows)
    .where(eq(follows.user_id, auth.userId))
    .orderBy(follows.created_at);
  return NextResponse.json(
    { slugs: rows.map((r) => r.slug) },
    { headers: noStore() },
  );
}

export async function POST(req: NextRequest) {
  const input = await readMutationBody(req);
  if (!input.ok) return input.response;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const dbr = requireDb();
  if (!dbr.ok) return dbr.response;

  const body = input.body;
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug || slug.length > 120) {
    return NextResponse.json({ error: "invalid-slug" }, { status: 400, headers: noStore() });
  }
  const source = typeof body.source === "string" ? body.source.slice(0, 32) : null;

  await ensureProfile(auth.userId);
  await dbr.db
    .insert(follows)
    .values({ user_id: auth.userId, place_slug: slug, source: source ?? undefined })
    .onConflictDoNothing({
      target: [follows.user_id, follows.place_slug],
    });
  return NextResponse.json({ ok: true, slug }, { headers: noStore() });
}

export async function DELETE(req: NextRequest) {
  const input = await readMutationBody(req);
  if (!input.ok) return input.response;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const dbr = requireDb();
  if (!dbr.ok) return dbr.response;

  const body = input.body;
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    return NextResponse.json({ error: "invalid-slug" }, { status: 400, headers: noStore() });
  }

  await dbr.db
    .delete(follows)
    .where(and(eq(follows.user_id, auth.userId), eq(follows.place_slug, slug)));
  return NextResponse.json({ ok: true, slug }, { headers: noStore() });
}

// Suppress unused-import warning for `sql` if the bundler is strict.
void sql;
