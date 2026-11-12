/**
 * GET /beta and anything under it: the retired beta invite address.
 *
 * Invite emails, social posts and old bookmarks still carry /beta, so it
 * lands on Today. This is a route handler and not a next.config.ts redirect
 * on purpose. A config redirect passes the request's query string through to
 * the destination, and invite links were built as
 * /beta?code=<personal code>&next=<path>. A config redirect would carry that
 * personal code onto /today, into the address bar, browser history and any
 * shared link. Building the destination from the path alone drops it.
 */
import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/today", request.url), 308);
}
