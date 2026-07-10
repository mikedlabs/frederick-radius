/**
 * /admin/api/resend-domain — manage the Resend sending domain from tooling.
 *
 * The RESEND_API_KEY is a sensitive env var (readable only inside deployed
 * functions), so domain setup has to happen where the key lives. Basic-Auth
 * gated via the /admin middleware like its send-invites sibling.
 *
 *   GET                        → domains with status + required DNS records
 *   POST { action: "create" }  → register frederickradius.app with Resend
 *   POST { action: "verify", id } → ask Resend to (re)check the DNS records
 *
 * The DNS records in responses are public by nature (DKIM public key, SPF
 * include, bounce MX) — they exist to be published in DNS.
 */
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const DOMAIN = "frederickradius.app";

function key(): string | null {
  return process.env.RESEND_API_KEY ?? null;
}

async function resend(path: string, init?: RequestInit) {
  const k = key();
  if (!k) return null;
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${k}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

export async function GET() {
  const list = await resend("/domains");
  if (!list) return NextResponse.json({ error: "no-key" }, { status: 503, headers: noStore });
  const domains = ((list.json as { data?: { id?: string; name?: string; status?: string }[] }).data ?? []);
  // The list endpoint omits DNS records; fetch details for our domain.
  const ours = domains.find((d) => d.name === DOMAIN);
  let records: unknown = null;
  if (ours?.id) {
    const detail = await resend(`/domains/${ours.id}`);
    records = (detail?.json as { records?: unknown })?.records ?? null;
  }
  return NextResponse.json({ domains, ours: ours ?? null, records }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  let body: { action?: string; id?: string };
  try {
    body = (await req.json()) as { action?: string; id?: string };
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }

  if (body.action === "create") {
    const created = await resend("/domains", {
      method: "POST",
      body: JSON.stringify({ name: DOMAIN, region: "us-east-1" }),
    });
    if (!created) return NextResponse.json({ error: "no-key" }, { status: 503, headers: noStore });
    return NextResponse.json(created.json, { status: created.status, headers: noStore });
  }

  if (body.action === "verify" && body.id) {
    const verified = await resend(`/domains/${encodeURIComponent(body.id)}/verify`, { method: "POST" });
    if (!verified) return NextResponse.json({ error: "no-key" }, { status: 503, headers: noStore });
    return NextResponse.json(verified.json, { status: verified.status, headers: noStore });
  }

  return NextResponse.json(
    { error: 'pass { action: "create" } or { action: "verify", id }' },
    { status: 400, headers: noStore },
  );
}
