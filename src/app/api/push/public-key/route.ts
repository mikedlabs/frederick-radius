/**
 * Returns the VAPID public key so the browser can call
 * pushManager.subscribe({ applicationServerKey }). Empty body when the
 * server hasn't been configured (the client UI hides itself in that
 * case rather than throwing).
 */
import { NextResponse } from "next/server";
import { publicVapidKey } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = publicVapidKey();
  return NextResponse.json({ key, enabled: Boolean(key) });
}
