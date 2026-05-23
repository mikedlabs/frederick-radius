/**
 * GET /api/discover/autocomplete?q=brun
 *
 * Frederick-County-scoped Google Places (New) autocomplete. The route
 * is a thin shell over the autocomplete client — the heavy lifting
 * (locationRestriction, includedRegionCodes, field-mask) is in
 * lib/integrations/google-autocomplete.ts.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { autocomplete } from "@/lib/integrations/google-autocomplete";
import { isSameOriginRequest } from "@/lib/origin-check";

export const runtime = "nodejs";

const Schema = z.object({
  q: z.string().min(1).max(200),
});

export async function GET(req: Request) {
  // Paid upstream — block hotlinking. Vercel Firewall handles the
  // per-IP rate limit on top of this.
  if (!isSameOriginRequest(req)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json(
      { ok: false, status: 503, message: "GOOGLE_PLACES_API_KEY not configured" },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  const parsed = Schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, status: 400, message: "invalid query", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const result = await autocomplete(parsed.data.q);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status >= 500 ? 502 : result.status });
  }
  return NextResponse.json(result, {
    status: 200,
    headers: {
      // Short cache — autocomplete is keystroke-driven; 60s is the
      // right balance of dedupe vs freshness.
      "Cache-Control": "private, max-age=60",
    },
  });
}
