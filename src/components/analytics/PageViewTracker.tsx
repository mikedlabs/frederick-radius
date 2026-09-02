"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { logActivity } from "@/lib/track";
import { shouldPostAutomaticActivity } from "@/lib/fair/route-policy";

/**
 * PageViewTracker — logs a `page_view` on each client route change to the
 * first-party per-member log ONLY.
 *
 * Uses logActivity (not track), so it never fires a Plausible custom event:
 * Plausible already counts page views natively, and a custom `page_view` would
 * double-count there and pollute every visitor's stream. The first-party post is
 * attributed to the signed member cookie and dropped for the non-NFC public and
 * for opted-out members. The path travels in the body (postFirstParty reads
 * location.pathname). Renders nothing. Deduped on the pathname so a re-render or
 * a Strict-Mode double effect never double-logs the same path.
 */
export default function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (
      !pathname ||
      pathname === lastPath.current ||
      !shouldPostAutomaticActivity(pathname)
    ) {
      return;
    }
    lastPath.current = pathname;
    logActivity("page_view");
  }, [pathname]);

  return null;
}
