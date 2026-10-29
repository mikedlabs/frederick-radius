"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { readResumedMapTabView } from "@/lib/primary-tab-session";
import { replaceMapUrl } from "@/lib/map-url-state";

/** A one-time mount handoff, not an ongoing route-query fallback. Explicit
 * shared q (including q=) wins, and any navigation before commit cancels it. */
export function useMapTabResumeQuery(enabled: boolean): string | null {
  const [entry] = useState(() => {
    if (!enabled || typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    if (url.pathname !== "/map" || url.searchParams.has("q")) return null;
    const href = `${url.pathname}${url.search}${url.hash}`;
    const saved = readResumedMapTabView(href);
    return saved ? { href, q: saved.q } : null;
  });
  const committed = useRef(false);
  useLayoutEffect(() => {
    if (!enabled || !entry || committed.current) return;
    committed.current = true;
    const live = new URL(window.location.href);
    if (`${live.pathname}${live.search}${live.hash}` !== entry.href || live.searchParams.has("q") || !entry.q) return;
    replaceMapUrl(params => params.set("q", entry.q), { preserveHistoryState: true });
  }, [enabled, entry]);
  return entry?.q ?? null;
}
