"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_codes } from "@/lib/db/schema";

/**
 * Server actions for the per-tester beta access codes.
 *
 * Gated by /admin/*'s Basic Auth (middleware, fail-closed) — no second check
 * here. All writes go through the BYPASSRLS server DB role.
 */

// Readable, unambiguous suffix alphabet: no 0/O/1/l/I so a texted code is never
// mistyped. Four chars over 30 symbols ≈ 810k combinations per prefix.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PREFIX = "frederick-";

function randomSuffix(len = 4): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Mint one or more new codes. Reads `label` (who/what it's for, optional) and
 * `count` (default 1, capped) from the form. Each code is `frederick-xxxx`.
 * Collisions are astronomically unlikely; the unique index is the backstop
 * (onConflictDoNothing skips a dupe rather than erroring the whole batch).
 */
export async function generateCodes(formData: FormData): Promise<void> {
  const label = String(formData.get("label") ?? "").trim().slice(0, 120) || null;
  const rawCount = Number.parseInt(String(formData.get("count") ?? "1"), 10);
  const count = Number.isFinite(rawCount) ? Math.min(Math.max(rawCount, 1), 50) : 1;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  const rows = Array.from({ length: count }, () => ({
    code: `${PREFIX}${randomSuffix()}`,
    label,
  }));
  await db.insert(beta_codes).values(rows).onConflictDoNothing();
  revalidatePath("/admin/beta-codes");
}

/** Revoke or restore a single code. Reads `code` and `revoked` ("1"/"0"). */
export async function setRevoked(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "");
  const revoked = String(formData.get("revoked") ?? "") === "1";
  if (!code) return;

  const db = getDb();
  if (!db) throw new Error("Database not configured.");
  await db.update(beta_codes).set({ revoked }).where(eq(beta_codes.code, code));
  revalidatePath("/admin/beta-codes");
}
