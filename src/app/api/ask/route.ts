import { NextResponse } from "next/server";
import { askFrederick } from "@/lib/ask/answer";
import { isSameOriginRequest, isRateLimited } from "@/lib/origin-check";

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

/**
 * GET /api/ask  → a TEMPORARY config diagnostic (names only, never
 * values). The marquee Ask kept reading configured:false after the key
 * was set in Vercel; this reports which signals the running deployment
 * actually sees + the NAMES of any AI-ish env vars present, so a naming
 * or environment-scope mismatch is visible at a glance. Remove once Ask
 * is confirmed live. Secret VALUES are never returned.
 */
export async function GET() {
  const AI_NAME = /AI|ANTHROPIC|OPENAI|GATEWAY|OIDC|LLM|MODEL|CLAUDE|GPT/i;
  const aiEnvNames = Object.keys(process.env)
    .filter((k) => AI_NAME.test(k))
    .sort();
  return NextResponse.json({
    signals: {
      AI_GATEWAY_API_KEY: Boolean(process.env.AI_GATEWAY_API_KEY),
      VERCEL_OIDC_TOKEN: Boolean(process.env.VERCEL_OIDC_TOKEN),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    },
    aiEnvNames,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // 15 questions/min per IP is generous for a human, fatal to a loop.
  if (await isRateLimited(req, "ask", 15, 60)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many questions — give it a moment." },
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
  const result = await askFrederick(query);
  return NextResponse.json(result);
}
