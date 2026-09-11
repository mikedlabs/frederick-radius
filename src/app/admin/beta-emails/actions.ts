"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_codes, beta_emails } from "@/lib/db/schema";
import { mintCodeForEmail, sendBetaCodeEmail } from "@/lib/beta-invite";

/**
 * Backfill invites: every signup email that does not yet have a personal
 * access code gets one minted (label = the email) and, when RESEND_API_KEY
 * is set, the invite email sent. Gated by /admin/*'s Basic Auth like every
 * admin action.
 *
 * Sequential on purpose, twice over: the pooled DB connection is max:1
 * (concurrent queries deadlock against Supavisor — see the beta dashboard
 * loader), and Resend rate-limits bursts. Tens of emails complete well
 * inside the action window.
 *
 * Redirects back with a ?invited=&emailed=&failed= summary the page renders.
 */
export async function sendAllCodes(): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not configured.");

  const emails = await db
    .select({ email: beta_emails.email })
    .from(beta_emails)
    .orderBy(desc(beta_emails.created_at));
  const labeled = await db.select({ label: beta_codes.label }).from(beta_codes);
  const alreadyCoded = new Set(labeled.map((r) => r.label).filter(Boolean));

  let invited = 0;
  let emailed = 0;
  let failed = 0;
  for (const { email } of emails) {
    if (alreadyCoded.has(email)) continue;
    const code = await mintCodeForEmail(email);
    if (!code) {
      failed++;
      continue;
    }
    invited++;
    if (await sendBetaCodeEmail(email, code)) emailed++;
  }

  revalidatePath("/admin/beta-emails");
  revalidatePath("/admin/beta-codes");
  redirect(`/admin/beta-emails?invited=${invited}&emailed=${emailed}&failed=${failed}`);
}
