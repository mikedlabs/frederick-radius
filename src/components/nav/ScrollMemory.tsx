"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * ScrollMemory — back-button scroll continuity for list surfaces
 * (app-like pass, phase 1).
 *
 * What Next already does, measured here before writing this: the App
 * Router restores scroll on SPA Back/Forward — fast-hydrating pages
 * (search results) come back pixel-perfect with no help. What it gets
 * wrong, also measured: list surfaces that re-hydrate after Back are
 * momentarily SHORT, Next restores against that intermediate height,
 * and the position clamps (700px stored, list briefly 1383px tall in
 * an 844px viewport → landed at 539) — and it never corrects once the
 * content finishes growing. The deeper the scroll, the worse the loss.
 *
 * So this component is a clamp CORRECTOR, not a restoration system:
 *   - It records the true position per URL (sessionStorage, rAF
 *     throttled), guarded so another page's scroll can't poison it —
 *     a write only counts while the URL still matches the key.
 *   - On popstate it re-asserts the stored position every frame for a
 *     settle window (~3s): late clamped restores (Next's own, or the
 *     browser's) get corrected the moment the document is tall enough.
 *     The FIRST user input (wheel, touch, pointer, key) aborts — the
 *     reader's intent always beats the memory.
 *   - If the page settles genuinely shorter than the memory (content
 *     changed since the visit), the deadline falls back to the bottom
 *     of what exists — better than the top.
 *
 * Two hard-won structural constraints (both measured, not assumed):
 * on an SPA Back, Next runs the destination route's effects BEFORE
 * popstate dispatches, and the layout Suspense boundary UNMOUNTS this
 * component during the transition — so the popstate listener lives at
 * MODULE scope and drives the correction itself; nothing depends on
 * effect-vs-popstate ordering. A fresh navigation clears that page's
 * stale memory via a DEFERRED clear that a popstate or a real scroll
 * write cancels, so an out-of-order event can't lose the position.
 * Document-load traversals (bfcache miss) never fire popstate; the
 * first effect after a load consults the Navigation Timing type
 * instead.
 */
const KEY_PREFIX = "fr:scroll:";
const RESTORE_WINDOW_MS = 3_000;
const CLEAR_DELAY_MS = 400;
const POP_FRESH_MS = 3_000;

function keyForLocation(): string {
  return `${KEY_PREFIX}${window.location.pathname}${window.location.search}`;
}

// Pending fresh-navigation clears, cancellable by popstate or a real
// scroll write. Key → timeout id.
const pendingClears = new Map<string, number>();

function cancelPendingClear(key: string) {
  const t = pendingClears.get(key);
  if (t !== undefined) {
    window.clearTimeout(t);
    pendingClears.delete(key);
  }
}

// The most recent history traversal, so a route effect that runs AFTER
// popstate (the other possible ordering) can recognise it as a Back.
let lastPop: { key: string; at: number } | null = null;

// The Navigation Timing entry describes the DOCUMENT load; only the first
// route effect after a load may read it (later SPA navs within the same
// document would otherwise inherit "back_forward" forever).
let consultedDocNav = false;

const ABORT_EVENTS = ["wheel", "touchmove", "pointerdown", "keydown"] as const;

function restoreFor(key: string) {
  let stored = 0;
  try {
    stored = Number(sessionStorage.getItem(key) ?? 0);
  } catch {
    return;
  }
  if (!Number.isFinite(stored) || stored <= 0) return;

  let cancelled = false;
  const cleanup = () => {
    for (const e of ABORT_EVENTS) window.removeEventListener(e, abort);
  };
  const abort = () => {
    cancelled = true;
    cleanup();
  };
  for (const e of ABORT_EVENTS) {
    window.addEventListener(e, abort, { passive: true });
  }

  const deadline = Date.now() + RESTORE_WINDOW_MS;
  let asserted = false;
  const attempt = () => {
    if (cancelled) return;
    // A further navigation moved us off this key — stand down.
    if (keyForLocation() !== key) {
      cleanup();
      return;
    }
    // Assert only when the FULL target is reachable; an intermediate
    // hydration height would clamp. Keep asserting until the settle
    // window closes — Next's own (clamped) restore can land AFTER ours
    // and would otherwise win.
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= stored) {
      if (Math.abs(window.scrollY - stored) > 2) {
        window.scrollTo({ top: stored, behavior: "instant" as ScrollBehavior });
      }
      asserted = true;
    }
    if (Date.now() < deadline) {
      requestAnimationFrame(attempt);
      return;
    }
    // Deadline: the page settled genuinely shorter than the memory
    // (content changed since the visit). Best effort — bottom of what
    // exists beats the top of the page.
    if (!asserted && max > 0) {
      window.scrollTo({ top: max, behavior: "instant" as ScrollBehavior });
    }
    cleanup();
  };
  requestAnimationFrame(attempt);
}

// The popstate listener lives at MODULE scope, not in an effect: this
// component sits behind the layout's Suspense boundary, which UNMOUNTS
// it during route transitions — exactly when popstate fires (measured:
// an init-script listener saw the event; the effect-attached one never
// did). A module listener can't be unmounted. By the time popstate
// fires the URL is already the destination, so it can act directly.
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const key = keyForLocation();
    lastPop = { key, at: Date.now() };
    cancelPendingClear(key);
    restoreFor(key);
  });
}

export default function ScrollMemory() {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = `${KEY_PREFIX}${pathname}${search?.size ? `?${search.toString()}` : ""}`;

  useEffect(() => {
    // Decide back-vs-fresh for THIS route state. Two back signals: a
    // fresh popstate record for this key (popstate-first ordering), or
    // a document load whose navigation type is back_forward. The
    // popstate-last ordering needs no signal here — the module listener
    // above corrects and cancels the clear on its own.
    let back = false;
    if (lastPop && lastPop.key === key && Date.now() - lastPop.at < POP_FRESH_MS) {
      back = true;
    } else if (!consultedDocNav) {
      consultedDocNav = true;
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      back = nav?.type === "back_forward";
    }

    if (back) {
      restoreFor(key);
    } else {
      // Fresh navigation: this page starts at the top, so its memory
      // resets — Back must mean "where I just was", never a stale
      // visit. Deferred so a popstate that dispatches AFTER this effect
      // (the measured Next ordering) can cancel it in time.
      cancelPendingClear(key);
      const t = window.setTimeout(() => {
        pendingClears.delete(key);
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* memory is a nicety, never an error */
        }
      }, CLEAR_DELAY_MS);
      pendingClears.set(key, t);
    }

    // Record real scrolls for this key. rAF-throttled, passive, and
    // guarded against the next navigation's scroll-to-top: a write only
    // counts while the URL still matches this key (without the guard the
    // outgoing page's listener overwrote the memory with 0 — measured).
    // A real write also cancels the pending clear — the user's position
    // beats a scheduled reset.
    let raf = 0;
    const save = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (keyForLocation() !== key) return;
        cancelPendingClear(key);
        try {
          sessionStorage.setItem(key, String(Math.round(window.scrollY)));
        } catch {
          /* ignore */
        }
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [key]);

  return null;
}
