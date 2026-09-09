"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const KEY = "fr:search-position:v1";
const MAX_AGE_MS = 30 * 60_000;
type Position = { href: string; scrollY: number; at: number; expanded?: boolean };

export function parseSearchPositions(raw: string | null, now = Date.now()): Position[] {
  if (!raw || raw.length > 64_000) return [];
  try {
    const rows: unknown = JSON.parse(raw);
    return Array.isArray(rows) ? rows.filter((row): row is Position =>
      row && typeof row.href === "string" && row.href.startsWith("/search?") && row.href.length <= 8192 &&
      Number.isFinite(row.scrollY) && row.scrollY >= 0 && row.scrollY <= 100_000 &&
      (row.expanded === undefined || typeof row.expanded === "boolean") &&
      Number.isFinite(row.at) && row.at <= now && now - row.at <= MAX_AGE_MS,
    ).slice(-6) : [];
  } catch { return []; }
}

/** Restore comparison position when returning from a map or detail. Keep
 * queries inside the current tab, with no account or telemetry dependency. */
export default function SearchBrowsePosition({ returnTo }: { returnTo?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const currentHref = `${pathname}?${params.toString()}`;
  const href = returnTo ?? currentHref;
  useEffect(() => {
    const read = () => {
      try { return parseSearchPositions(sessionStorage.getItem(KEY)); }
      catch { return []; }
    };
    const saved = read().find((row) => row.href === href);
    const more = document.querySelector<HTMLDetailsElement>("details[data-search-more]");
    if (more && saved?.expanded) more.open = true;
    let frame = 0;
    let restored = !saved;
    if (saved) {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          window.scrollTo({ top: saved.scrollY, behavior: "instant" });
          restored = true;
        });
      });
    }
    const save = () => {
      if (!restored) return;
      const current = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`;
      if (current !== currentHref) return;
      const rows = read().filter((row) => row.href !== href);
      rows.push({ href, scrollY: window.scrollY, at: Date.now(), expanded: Boolean(more?.open) });
      try { sessionStorage.setItem(KEY, JSON.stringify(rows.slice(-6))); }
      catch { /* Browsing remains available without storage. */ }
    };
    const scroll = () => {
      if (!restored) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(save);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", save);
    document.addEventListener("click", save, true);
    document.addEventListener("toggle", save, true);
    return () => {
      cancelAnimationFrame(frame);
      save();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("click", save, true);
      document.removeEventListener("toggle", save, true);
    };
  }, [currentHref, href]);
  return null;
}
