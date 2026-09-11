import { safeRedirectPath } from "@/lib/safe-redirect";

const BETA_URL = "https://frederickradius.app/beta";

/** Build a same-origin invite link without letting an untrusted return path escape. */
export function buildBetaInviteLink(code: string, next?: unknown): string {
  const url = new URL(BETA_URL);
  url.searchParams.set("code", code);
  url.searchParams.set("next", safeRedirectPath(next, "/today"));
  return url.toString();
}
