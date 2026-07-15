/**
 * Returns the VAPID public key so the browser can call
 * pushManager.subscribe({ applicationServerKey }). Empty body when the
 * server hasn't been configured (the client UI hides itself in that
 * case rather than throwing).
 */
import { publicVapidKey } from "@/lib/push";
import { guardPushRead, pushJson } from "@/lib/push-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guarded = await guardPushRead(request, "push-public-key", 120, 60);
  if (guarded) return guarded;

  const key = publicVapidKey();
  return pushJson({ key, enabled: Boolean(key) });
}
