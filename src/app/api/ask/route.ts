import { meterUsage } from "@/lib/usage-meter";
import { NextResponse } from "next/server";
import { askFrederick } from "@/lib/ask/answer";
import { isSameOriginRequest, isRateLimited } from "@/lib/origin-check";
import { isRuntimeFlagEnabled } from "@/lib/runtime-flags";
import { checkBotId } from "botid/server";

/**
 * POST /api/ask  → { configured, answer, sources }
 *
 * The "Ask Frederick" concierge endpoint. Grounded + fail-soft: with no
 * AI key it returns { configured:false } and the UI shows a coming-soon
 * state. Never fabricates — the model only sees retrieved real places.
 *
 * Abuse protection: this is the most expensive route in the app — each
 * call hits a paid LLM — so it carries the same guard the paid Google
 * routes already use. A foreign origin is rejected (cheap hot-link
 * filter), and a per-IP rate limit caps bursts (a no-op until Vercel KV
 * is configured; see isRateLimited). Without these, an unauthenticated
 * POST loop could run up the AI bill unbounded.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (await isRuntimeFlagEnabled("disableAsk")) {
    return NextResponse.json(
      { configured: false, answer: null, sources: [], disabled: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
  const verification = await checkBotId();
  if (verification.isBot) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // 15 questions/min per IP is generous for a human, fatal to a loop.
  if (await isRateLimited(req, "ask", 15, 60)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many questions. Give it a moment." },
      { status: 429 },
    );
  }

  let body: { query?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const query = typeof body.query === "string" ? body.query.slice(0, 300) : "";
  meterUsage("anthropic_ask");
  const result = await askFrederick(query);
  return NextResponse.json(result);
}
