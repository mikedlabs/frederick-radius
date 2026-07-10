"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";
import { BETA_ID_COOKIE } from "@/lib/beta-constants";

/**
 * BetaTelemetry — attributes beta usage to the individual tester whose access
 * code let them in. Renders nothing.
 *
 * The code rides in the readable `fr_who` cookie (the httpOnly `fr_beta` cookie
 * stays the actual credential). Once per browser session we (1) fire a single
 * `beta_active` analytics event tagged with the code, so Plausible shows a
 * per-tester activity breakdown, and (2) ping /api/beta/seen so the admin list
 * reflects who is currently active. The session guard keeps it to one of each
 * per visit; the owner master key ("owner") is skipped so our own testing
 * doesn't pollute the tester cohort.
 */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function BetaTelemetry() {
  useEffect(() => {
    const code = readCookie(BETA_ID_COOKIE);
    if (!code || code === "owner") return;
    try {
      if (sessionStorage.getItem("fr_beta_active")) return;
      sessionStorage.setItem("fr_beta_active", "1");
    } catch {
      // Private mode / storage disabled — fall through and fire once per mount.
    }
    track("beta_active", { code });
    // Best-effort last-seen refresh; never surfaces an error to the user.
    void fetch("/api/beta/seen", { method: "POST", keepalive: true }).catch(() => {});
  }, []);

  return null;
}
