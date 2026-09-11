"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMode, type Mode } from "@/hooks/useMode";

/**
 * ModeParamSync — apply `?for=visitor|resident` from the URL into the
 * persisted mode, then strip the param so the URL stays clean.
 *
 * Why this exists
 *   Marketing / partner deep links (e.g. visitfrederick.com sending
 *   a visitor straight to /events?for=visitor) want to set the lens
 *   without making the user hunt for a toggle. Proposal B's
 *   "restrained" execution: one query param, no separate IA.
 *
 * Behavior
 *   - Reads the `for` param off the URL on every navigation.
 *   - If it's a valid mode, writes it through useMode.setMode (which
 *     persists to localStorage AND mirrors to the fr_mode cookie so
 *     SSR copy can also bias correctly).
 *   - Strips the param via router.replace so the address bar stays
 *     clean for sharing / refresh / browser history. Uses pathname
 *     explicitly so the route doesn't collapse to "/".
 *   - Quiet: no toast, no haptic. The mode-aware UI flips visibly.
 *
 * Renders nothing. Mounted in (app)/layout so every route honors it.
 */
export default function ModeParamSync() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { setMode } = useMode();

  useEffect(() => {
    const v = params.get("for");
    if (v !== "visitor" && v !== "resident") return;
    setMode(v as Mode);
    // Strip the param while preserving any others. Construct an
    // absolute path so the replace lands on the current route, not
    // on the app root.
    const next = new URLSearchParams(params.toString());
    next.delete("for");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, router, pathname, setMode]);

  return null;
}
