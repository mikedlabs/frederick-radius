"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/track";
import { shouldPostAutomaticActivity } from "@/lib/fair/route-policy";
import {
  BETA_ID_COOKIE,
  BETA_OWNER_MARKER,
  BETA_TESTER_MARKER,
} from "@/lib/beta-constants";

/**
 * BetaTelemetry — records aggregate beta activity and refreshes the internal
 * access record's recent-use timestamp. Renders nothing.
 *
 * The readable `fr_who` cookie contains only "tester" or "owner" (the httpOnly
 * `fr_beta` cookie stays the actual credential). Once per browser session we
 * (1) fire an aggregate `beta_active` event with NO identifier attached, and
 * (2) ping /api/beta/seen, which verifies the httpOnly signed credential on the
 * server before refreshing the matching internal row. The owner master key is
 * skipped so owner testing does not pollute the beta count.
 */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Kept as a tiny test seam: analytics receives an event name, never a code. */
export function recordAggregateBetaActivity(): void {
  track("beta_active");
}

export default function BetaTelemetry() {
  const pathname = usePathname();
  const recorded = useRef(false);

  useEffect(() => {
    if (recorded.current || !shouldPostAutomaticActivity(pathname)) return;
    const identity = readCookie(BETA_ID_COOKIE);
    if (!identity || identity === BETA_OWNER_MARKER) return;
    // Older sessions may still carry the pre-fix personal code in this
    // browser-readable cookie. Replace it immediately with the coarse marker;
    // /api/beta/seen derives identity from the separate httpOnly credential.
    if (identity !== BETA_TESTER_MARKER) {
      document.cookie = `${BETA_ID_COOKIE}=${BETA_TESTER_MARKER}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; Secure`;
    }
    try {
      if (sessionStorage.getItem("fr_beta_active")) return;
      sessionStorage.setItem("fr_beta_active", "1");
    } catch {
      // Private mode / storage disabled — fall through and fire once per mount.
    }
    recorded.current = true;
    recordAggregateBetaActivity();
    // Best-effort last-seen refresh; never surfaces an error to the user.
    void fetch("/api/beta/seen", { method: "POST", keepalive: true }).catch(() => {});
  }, [pathname]);

  return null;
}
