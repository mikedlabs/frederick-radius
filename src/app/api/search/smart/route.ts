import { NextResponse } from "next/server";

/**
 * Retired prototype. The active Find flow uses bounded local search, and Ask
 * owns the reviewed AI budget. Keep a deliberate response for old callers
 * without letting this unused URL invoke a provider outside those controls.
 */
export async function GET() {
  return NextResponse.json(
    { error: "retired", searchPath: "/api/search", askPath: "/ask" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
