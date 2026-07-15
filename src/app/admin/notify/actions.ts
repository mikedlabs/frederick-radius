"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { broadcast, parseSegment, segmentLabel } from "@/lib/push-broadcast";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Send one owner broadcast. Owner-triggered only (the whole /admin surface is
 * Basic-Auth gated in middleware). Validates + clamps input, keeps the click
 * URL relative + same-origin, then hands off to the broadcast layer, which
 * routes every recipient through the shared quiet-hours gate. Redirects back
 * with a result summary the page renders as a flash.
 */
export async function sendBroadcast(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  const body = String(formData.get("body") ?? "").trim().slice(0, 300);
  const rawUrl = String(formData.get("url") ?? "").trim();
  const seg = parseSegment(String(formData.get("segment") ?? ""));
  const urgent = formData.get("urgent") === "on";

  if (!title || !body || !seg) {
    redirect("/admin/notify?error=1");
  }

  const url = safeRedirectPath(rawUrl, "/today");

  const res = await broadcast(seg, { title, body, url }, { urgent });
  revalidatePath("/admin/notify");
  redirect(
    `/admin/notify?sent=${res.sent}&held=${res.held}&gone=${res.gone}&to=${encodeURIComponent(segmentLabel(seg))}`,
  );
}
