"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * usePrefetchOnHover — fire `router.prefetch(href)` when the user
 * hovers (desktop) or touches (mobile) a target element.
 *
 * Why this exists:
 *   Next 16's <Link prefetch> auto-fires on viewport entry, which is
 *   great for static text links but doesn't help with two real cases:
 *
 *     1. Buttons that route via `onClick={() => router.push(href)}`.
 *        Without a <Link>, there's no auto-prefetch hook — the user
 *        taps and waits the full RTT for the next route to start.
 *     2. Long lists of <Link>s on cards where the viewport-entry
 *        prefetch triggers WAY too early (e.g. all 24 PlaceCards on
 *        /m/[town] start prefetching together when the section
 *        scrolls into view). Hovering one specific card is a much
 *        stronger intent signal.
 *
 *   This hook attaches `pointerenter` (covers mouse hover) and
 *   `touchstart` (covers mobile pre-tap) listeners that prefetch once
 *   per target, then go quiet. Idempotent — multiple components can
 *   prefetch the same href without thrash.
 *
 * Usage:
 *
 *   const ref = usePrefetchOnHover<HTMLDivElement>("/places/baker-park");
 *   return <div ref={ref} onClick={...}>Baker Park</div>;
 *
 * For <Link>s that already auto-prefetch on viewport entry, don't
 * use this — let Next do its job.
 */
export function usePrefetchOnHover<T extends HTMLElement = HTMLElement>(
  href: string | null | undefined,
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !href) return;

    const onIntent = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      try {
        router.prefetch(href);
      } catch {
        /* Next throws if the route isn't prefetchable (e.g. dynamic
         * route without generateStaticParams). Safe to swallow. */
      }
    };

    // pointerenter covers mouse hover; touchstart fires the moment a
    // finger lands (before the tap completes), giving us a ~100ms
    // head start on the route fetch vs waiting for click.
    el.addEventListener("pointerenter", onIntent, { passive: true });
    el.addEventListener("touchstart", onIntent, { passive: true });
    return () => {
      el.removeEventListener("pointerenter", onIntent);
      el.removeEventListener("touchstart", onIntent);
    };
  }, [href, router]);

  return ref;
}
