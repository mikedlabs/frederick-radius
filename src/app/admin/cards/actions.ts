"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { nfc_cards } from "@/lib/db/schema";
import { newCardCode, CARD_CODE_RE } from "@/lib/nfc";

/**
 * Server action for minting NFC cards.
 *
 * Gated by /admin/*'s Basic Auth (middleware, fail-closed) — no second check
 * here. All writes go through the BYPASSRLS server DB role. Codes are random and
 * regex-valid (src/lib/nfc.ts); collisions are astronomically unlikely, and the
 * primary key is the backstop (onConflictDoNothing skips a dupe rather than
 * erroring the whole batch).
 */

const BASE = "https://frederickradius.app";

export type MintResult = { urls: string[]; error?: string };

/**
 * Mint a batch of N reusable cards. Reads `label` (who/what it's for), `batch`
 * (a print-run label), and `count` (default 1, capped) from the form, inserts N
 * nfc_cards rows, and returns the tap URLs so the owner can copy or export them
 * to write onto the physical cards.
 */
export async function mintCards(_prev: MintResult, formData: FormData): Promise<MintResult> {
  const label = String(formData.get("label") ?? "").trim().slice(0, 120) || null;
  const batch = String(formData.get("batch") ?? "").trim().slice(0, 60) || null;
  const rawCount = Number.parseInt(String(formData.get("count") ?? "1"), 10);
  const count = Number.isFinite(rawCount) ? Math.min(Math.max(rawCount, 1), 100) : 1;

  const db = getDb();
  if (!db) return { urls: [], error: "Database is not configured." };

  const rows = Array.from({ length: count }, () => ({ code: newCardCode(), label, batch }));

  try {
    const inserted = await db
      .insert(nfc_cards)
      .values(rows)
      .onConflictDoNothing()
      .returning({ code: nfc_cards.code });
    revalidatePath("/admin/cards");
    return { urls: inserted.map((r) => `${BASE}/j/${r.code}`) };
  } catch {
    return { urls: [], error: "Could not mint cards. Is the nfc_cards table migrated?" };
  }
}

/**
 * Turn a card on or off. `active=false` is the ONLY kill switch the /j tap route
 * honors — an inactive card redirects to /beta exactly like an unknown code and
 * grants no access, so a leaked or over-shared card can be shut off from here
 * without a SQL console. Gated by /admin/*'s Basic Auth like every action here.
 */
export async function setCardActive(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim().toLowerCase();
  const active = String(formData.get("active") ?? "") === "true";
  if (!CARD_CODE_RE.test(code)) return;

  const db = getDb();
  if (!db) return;
  try {
    await db.update(nfc_cards).set({ active }).where(eq(nfc_cards.code, code));
    revalidatePath("/admin/cards");
  } catch {
    /* fail soft — the admin can retry; nothing user-facing depends on this */
  }
}
