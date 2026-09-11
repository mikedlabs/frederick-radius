"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db/client";

/**
 * Field-notes editor actions. Gated by the /admin Basic Auth in middleware
 * (these POST to the same /admin/* path, so auth is auto-resent). Writes to the
 * field_notes table, then revalidates the editor AND the surfaces that read it
 * so an added deal shows on /today immediately.
 */

const KINDS = new Set(["deal", "parking", "insider", "happy_hour"]);
const CONF = new Set(["high", "medium", "low"]);
const DAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: string): string | null {
  return v ? v : null;
}

function revalidateAll(): void {
  revalidatePath("/admin/field-notes");
  revalidatePath("/today");
  revalidatePath("/deals");
}

export async function addFieldNote(formData: FormData): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  const place_slug = s(formData, "place_slug");
  const text = s(formData, "text");
  if (!place_slug || !text) return;
  const kind = KINDS.has(s(formData, "kind")) ? s(formData, "kind") : "deal";
  const confidence = CONF.has(s(formData, "confidence")) ? s(formData, "confidence") : "medium";
  const dayRaw = s(formData, "day_of_week").toLowerCase();
  const day_of_week = DAYS.has(dayRaw) ? dayRaw : null;
  const hours = orNull(s(formData, "hours"));
  const source_url = orNull(s(formData, "source_url"));
  const last_verified = orNull(s(formData, "last_verified"));
  const expires_at = orNull(s(formData, "expires_at"));
  await sql`
    insert into field_notes (place_slug, kind, text, day_of_week, hours, source_url, confidence, last_verified, expires_at)
    values (${place_slug}, ${kind}, ${text}, ${day_of_week}, ${hours}, ${source_url}, ${confidence}, ${last_verified}, ${expires_at})
  `;
  revalidateAll();
}

/** Soft-retire a note (set expires_at = today) — it stops surfacing but stays
 *  on the books. Use delete for a mistake. */
export async function expireFieldNote(formData: FormData): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  const id = s(formData, "id");
  if (!id) return;
  await sql`update field_notes set expires_at = current_date, updated_at = now() where id = ${id}`;
  revalidateAll();
}

export async function deleteFieldNote(formData: FormData): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  const id = s(formData, "id");
  if (!id) return;
  await sql`delete from field_notes where id = ${id}`;
  revalidateAll();
}
