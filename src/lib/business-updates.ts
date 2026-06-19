/**
 * Pure helpers for the business-update PUBLISH path (the second half of the
 * follow -> reach loop). No DB or server-only imports here, so the validation +
 * authorization logic is unit-testable; the route handler in
 * src/app/api/business/updates/route.ts composes these with the DB writes and
 * the push fan-out.
 */
import type { PushPayload } from "@/lib/push";

/** Allowed update kinds — mirrors the business_updates.update_type comment.
 *  Kept as a list (not a DB enum) so a new kind needs no migration. */
export const UPDATE_TYPES = [
  "announcement",
  "event",
  "special",
  "closure",
  "hours",
  "general",
] as const;
export type UpdateType = (typeof UPDATE_TYPES)[number];

export type PublishBody = {
  slug: string;
  title: string;
  body: string;
  update_type: UpdateType;
};

/**
 * Is this email on the ADMIN allowlist? The allowlist is a comma/space-
 * separated env string (ADMIN_EMAILS). Case-insensitive. Returns false when
 * either side is missing, so an unset allowlist never grants access.
 */
export function isAdminEmail(
  email: string | null | undefined,
  allowlist: string | undefined,
): boolean {
  if (!email || !allowlist) return false;
  const set = allowlist
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return set.includes(email.trim().toLowerCase());
}

/**
 * Validate + normalize the publish request body. Pure — the route does the
 * auth + persistence. Bodies are clamped to notification-sane lengths (a push
 * title/body that overflows is just truncated by the OS, so we cap up front).
 */
export function parsePublishBody(
  raw: unknown,
): { ok: true; value: PublishBody } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "invalid-body" };
  const r = raw as Record<string, unknown>;

  const slug = typeof r.slug === "string" ? r.slug.trim() : "";
  if (!slug || slug.length > 120) return { ok: false, error: "invalid-slug" };

  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title || title.length > 120) return { ok: false, error: "invalid-title" };

  const body = typeof r.body === "string" ? r.body.trim() : "";
  if (!body || body.length > 280) return { ok: false, error: "invalid-body-text" };

  const ut = typeof r.update_type === "string" ? r.update_type.trim().toLowerCase() : "general";
  const update_type = (UPDATE_TYPES as readonly string[]).includes(ut)
    ? (ut as UpdateType)
    : "general";

  return { ok: true, value: { slug, title, body, update_type } };
}

/**
 * Build the push payload for a published update. Deep-links to the place page
 * (never an arbitrary caller-supplied URL — a push must not open somewhere the
 * owner doesn't control), and tags by business so a venue's rare updates
 * collapse to one notification rather than stacking.
 */
export function composeUpdatePush(
  slug: string,
  update: { title: string; body: string },
): PushPayload {
  return {
    title: update.title,
    body: update.body,
    url: `/places/${slug}`,
    tag: `biz:${slug}`,
  };
}
