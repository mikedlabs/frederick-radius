/**
 * POST /admin/api/send-invites — run the invite backfill and report results.
 *
 * The same operation as the "Mint + email codes" button on /admin/beta-emails
 * (both call the shared helpers), exposed as an admin-gated endpoint so the
 * backfill can be triggered and VERIFIED from tooling: the response says
 * exactly how many codes were minted, how many emails Resend accepted, and
 * which addresses failed. Basic Auth via the /admin middleware, like
 * /admin/api/owner-alerts.
 *
 * Optional body { probe: "email@x" } invites ONLY that address (canary before
 * a batch). Idempotent: an address with a live code is skipped by the batch,
 * and a probe re-send reuses the existing code.
 */
import { NextResponse, type NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_codes, beta_emails } from "@/lib/db/schema";
import { mintCodeForEmail, sendBetaCodeEmail } from "@/lib/beta-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const noStore = { "Cache-Control": "no-store" };

/**
 * GET — diagnosis: what does Resend think of this key and its domains?
 * Returns each domain's verification status so a 403 on send is explainable
 * without log-diving. Read-only against Resend; no DB.
 */
export async function GET() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ keyPresent: false, domains: [] }, { headers: noStore });
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { name?: string; status?: string; region?: string }[];
    };
    return NextResponse.json(
      {
        keyPresent: true,
        keyAccepted: res.ok,
        status: res.status,
        domains: (json.data ?? []).map((d) => ({ name: d.name, status: d.status, region: d.region })),
      },
      { headers: noStore },
    );
  } catch (err) {
    return NextResponse.json(
      { keyPresent: true, keyAccepted: false, error: err instanceof Error ? err.message : "fetch-failed" },
      { status: 502, headers: noStore },
    );
  }
}

export async function POST(req: NextRequest) {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "no-db" }, { status: 503, headers: noStore });

  // The batch must be asked for BY NAME. An earlier deploy-probe with a
  // malformed body fell through to "empty body = full batch" and started
  // inviting the real list against a broken Resend config — never again.
  let probe: string | null = null;
  let batch = false;
  try {
    const body = (await req.json()) as { probe?: string; batch?: boolean };
    if (typeof body.probe === "string" && body.probe.includes("@")) probe = body.probe.trim().toLowerCase();
    batch = body.batch === true;
  } catch {
    /* fall through to the 400 below */
  }
  if (!probe && !batch) {
    return NextResponse.json(
      { error: "pass { probe: \"email@…\" } or { batch: true }" },
      { status: 400, headers: noStore },
    );
  }

  const resendConfigured = Boolean(process.env.RESEND_API_KEY);

  if (probe) {
    const code = await mintCodeForEmail(probe);
    if (!code) return NextResponse.json({ error: "mint-failed" }, { status: 500, headers: noStore });
    const sent = await sendBetaCodeEmail(probe, code);
    return NextResponse.json({ probe, code, sent, resendConfigured }, { headers: noStore });
  }

  const emails = await db
    .select({ email: beta_emails.email })
    .from(beta_emails)
    .orderBy(desc(beta_emails.created_at));
  const labeled = await db.select({ label: beta_codes.label }).from(beta_codes);
  const alreadyCoded = new Set(labeled.map((r) => r.label).filter(Boolean));

  let skippedExisting = 0;
  let minted = 0;
  let sent = 0;
  let stoppedEarly = false;
  const failures: string[] = [];
  // Sequential on purpose: max:1 pooled DB connection + Resend burst limits.
  for (const { email } of emails) {
    if (alreadyCoded.has(email)) {
      skippedExisting++;
      continue;
    }
    const code = await mintCodeForEmail(email);
    if (!code) {
      failures.push(email);
      continue;
    }
    minted++;
    if (await sendBetaCodeEmail(email, code)) {
      sent++;
    } else {
      failures.push(email);
      // Three straight failures with zero successes = the key/domain is bad;
      // stop rather than burn the whole list on a misconfiguration.
      if (sent === 0 && failures.length >= 3) {
        stoppedEarly = true;
        break;
      }
    }
  }

  return NextResponse.json(
    { total: emails.length, skippedExisting, minted, sent, failures, stoppedEarly, resendConfigured },
    { headers: noStore },
  );
}
