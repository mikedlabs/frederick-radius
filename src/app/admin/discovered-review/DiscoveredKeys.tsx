"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { decide } from "./actions";

/**
 * Keyboard-driven triage for the ~1,060-item discovered queue. Mouse-click +
 * full page reload per item was the biggest throughput sink; keys plus a
 * router.replace (client nav, no full reload) make it a fast a/r/s rhythm.
 *
 *   a = approve   r = reject   c = clear
 *   s / j / →  = skip to next undecided
 *   k / ←      = previous candidate
 */
export default function DiscoveredKeys({
  placeId,
  index,
  nextIndex,
  total,
}: {
  placeId: string;
  index: number;
  nextIndex: number;
  total: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const go = (i: number) => router.replace(`/admin/discovered-review?i=${i}`);
    const onKey = async (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      switch (e.key.toLowerCase()) {
        case "a":
          e.preventDefault();
          await decide(placeId, "approved");
          go(nextIndex);
          break;
        case "r":
          e.preventDefault();
          await decide(placeId, "rejected");
          go(nextIndex);
          break;
        case "c":
          e.preventDefault();
          await decide(placeId, "clear");
          break;
        case "s":
        case "j":
        case "arrowright":
          e.preventDefault();
          go(nextIndex);
          break;
        case "k":
        case "arrowleft":
          e.preventDefault();
          go(total > 0 ? (index - 1 + total) % total : 0);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placeId, index, nextIndex, total, router]);

  return (
    <p
      className="mt-2 font-mono text-[11px]"
      style={{ color: "var(--app-ink-3)" }}
      aria-hidden
    >
      keys: <b>a</b> approve · <b>r</b> reject · <b>c</b> clear · <b>s</b>/→ skip · <b>k</b>/← back
    </p>
  );
}
