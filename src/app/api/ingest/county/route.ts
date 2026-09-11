import { NextResponse } from "next/server";
import { verifyCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  // The retired RSSFeed.aspx endpoint is RSS, not iCalendar. County events
  // now use the category-specific CivicEngage iCalendar feeds, which are also
  // the scheduled production path. Keep this authenticated legacy endpoint as
  // a same-origin redirect so old operator bookmarks do useful work.
  const target = new URL("/api/ingest/civicengage", request.url);
  target.searchParams.set("only", "Frederick County");
  return NextResponse.redirect(target, 307);
}
