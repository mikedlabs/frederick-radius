import { NextResponse } from "next/server";
import { loadCivicSignals } from "@/lib/civic-signals";

export const dynamic = "force-dynamic";

/**
 * Public aggregate findings only.
 *
 * The loader and serializer form the security boundary: source features,
 * geometry, report text, addresses, and individual issue IDs are never part of
 * this response contract.
 */
export async function GET() {
  const payload = await loadCivicSignals();
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
