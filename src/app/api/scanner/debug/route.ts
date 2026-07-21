/**
 * Scanner diagnostic — a TEMPORARY, content-free probe to root-cause why the
 * live feed isn't reading on prod. Returns only structural signals: whether the
 * env is configured, Slack's own ok/error, how many messages came back, which
 * attachment fields they carry, and how many parse / survive the public
 * allowlist. NEVER returns the token, an address, or any call text — so it is
 * safe to hit without auth while we debug. Remove once the feed is confirmed.
 *
 *   GET /api/scanner/debug
 */
import { NextResponse } from "next/server";
import { publicIncident, parseIncidentLine } from "@/lib/scanner/incidentFeed";
import { messageCandidates } from "@/lib/integrations/scannerIncidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.SCANNER_SLACK_BOT_TOKEN || "";
  const channel = process.env.SCANNER_INCIDENTS_CHANNEL || "";
  const configured = Boolean(token && channel);

  if (!configured) {
    return NextResponse.json({
      configured: false,
      hasToken: Boolean(token),
      hasChannel: Boolean(channel),
      hint: "Set SCANNER_SLACK_BOT_TOKEN + SCANNER_INCIDENTS_CHANNEL in Vercel (Production) and redeploy.",
    });
  }

  try {
    const res = await fetch(
      `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}&limit=25`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; messages?: Array<Record<string, unknown>> }
      | null;

    const ok = Boolean(data?.ok);
    const messages = Array.isArray(data?.messages) ? data!.messages! : [];
    const first = messages[0] as
      | { text?: unknown; attachments?: Array<Record<string, unknown>> }
      | undefined;

    let parsed = 0;
    let kept = 0;
    for (const m of messages) {
      const cands = messageCandidates(m as never).map((s) =>
        s.replace(/^attachment:\s*/i, "").trim(),
      );
      const line = cands.find((s) => parseIncidentLine(s));
      if (line) {
        parsed++;
        if (publicIncident(line)) kept++;
      }
    }

    return NextResponse.json({
      configured: true,
      slackOk: ok,
      slackError: data?.error ?? null,
      messageCount: messages.length,
      firstMessageShape: first
        ? {
            hasText: typeof first.text === "string" && first.text.length > 0,
            attachmentCount: Array.isArray(first.attachments) ? first.attachments.length : 0,
            attachmentFields:
              Array.isArray(first.attachments) && first.attachments[0]
                ? Object.keys(first.attachments[0])
                : [],
          }
        : null,
      parsedFromMessages: parsed,
      publicKept: kept,
    });
  } catch {
    return NextResponse.json({ configured: true, slackOk: false, error: "fetch_failed" });
  }
}
