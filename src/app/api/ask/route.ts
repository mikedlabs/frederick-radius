import { NextResponse } from "next/server";
import { askFrederick } from "@/lib/ask/answer";

/**
 * POST /api/ask  → { configured, answer, sources }
 *
 * The "Ask Frederick" concierge endpoint. Grounded + fail-soft: with no
 * AI key it returns { configured:false } and the UI shows a coming-soon
 * state. Never fabricates — the model only sees retrieved real places.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
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
