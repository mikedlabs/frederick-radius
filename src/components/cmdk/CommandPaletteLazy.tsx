"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * CommandPaletteLazy — keeps the `cmdk` bundle out of every route's
 * first-load JS.
 *
 * The palette is a desktop-only ⌘K affordance (mobile uses the /search
 * page), so it never needs to be in the critical path — especially on
 * mobile, where it's never invoked. We mount the real CommandPalette
 * only once the page is idle (a couple seconds after first paint), which
 * is long before a user could realistically reach for ⌘K. Net effect:
 * cmdk + the palette load as a separate chunk after the page is
 * interactive, not before.
 */
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });

export default function CommandPaletteLazy() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (w.requestIdleCallback) {
      idleId = w.requestIdleCallback(() => setReady(true), { timeout: 3000 });
    } else {
      timerId = setTimeout(() => setReady(true), 2000);
    }
    return () => {
      if (idleId !== undefined && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, []);

  return ready ? <CommandPalette /> : null;
}
