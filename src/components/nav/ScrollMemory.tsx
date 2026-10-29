"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { consumeBrowseScrollReturn } from "@/lib/browse-scroll-return";
import { restoreBrowseFocusReturn, takeBrowseFocusReturn, type BrowseFocusReturn } from "@/lib/browse-focus-return";
import { cancelPrimaryTabResume, consumePrimaryTabResume, rememberPrimaryTab } from "@/lib/primary-tab-session";

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
 *   - On popstate it waits for the actual Events board's URL/data readiness
 *     before starting the normal ~3s settle window. A short server preview
 *     must not use up that correction window while Explorer is still loading.
 *     Late clamped restores get corrected once the document is tall enough.
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
const EVENTS_READY_WAIT_MS = 10_000;
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
let consultedFocusDocNav = false;

const ABORT_EVENTS = ["wheel", "touchmove", "pointerdown", "keydown"] as const;

type ActiveCorrection = { key: string; cancel: () => void };
let activeCorrection: ActiveCorrection | null = null;
let documentDeparted = false;

function eventsSurfaceReady(): boolean {
  if (window.location.pathname !== "/events") return true;
  // The same actual-board contract used by native detail focus restoration.
  // A preview, a URL-only hydrate, or an in-flight continuation is not ready.
  const board = document.querySelector("[data-events-interaction-ready]");
  return board?.getAttribute("data-events-interaction-ready") === "true"
    && board.getAttribute("data-events-complete") === "true"
    && board.getAttribute("aria-busy") === "false";
}

function restoreFor(key: string, requestedPosition?: number) {
  if (documentDeparted) return;
  cancelPendingClear(key);
  // Module popstate, a late route effect and Strict Mode can all describe
  // this one return. Keep the original target and bounded wait they captured.
  if (activeCorrection?.key === key) return;
  activeCorrection?.cancel();
  let stored = 0;
  try {
    stored = requestedPosition ?? Number(sessionStorage.getItem(key) ?? 0);
  } catch {
    return;
  }
  if (!Number.isFinite(stored) || stored < 0 || (stored === 0 && requestedPosition === undefined)) return;

  let cancelled = false;
  let frame = 0;
  const owner: ActiveCorrection = { key, cancel: () => cleanup() };
  const cleanup = () => {
    if (cancelled) return;
    cancelled = true;
    cancelAnimationFrame(frame);
    for (const e of ABORT_EVENTS) window.removeEventListener(e, abort);
    window.removeEventListener("pagehide", abort);
    if (activeCorrection === owner) activeCorrection = null;
  };
  const abort = () => cleanup();
  activeCorrection = owner;
  for (const e of ABORT_EVENTS) {
    window.addEventListener(e, abort, { passive: true });
  }
  window.addEventListener("pagehide", abort);

  const readinessDeadline = Date.now() + EVENTS_READY_WAIT_MS;
  let settleDeadline: number | null = eventsSurfaceReady()
    ? Date.now() + RESTORE_WINDOW_MS : null;
  const maxPosition = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const finishAtCurrentHeight = () => {
    // A readiness timeout cannot prove the page is genuinely shorter. Bound
    // best effort by the original target, never jump past it to a tall preview.
    const final = Math.min(stored, maxPosition());
    if (Math.abs(window.scrollY - final) > 2) {
      window.scrollTo({ top: final, behavior: "instant" as ScrollBehavior });
    }
    // Only a completed correction records its bounded result. Departure,
    // route changes and user intent leave the original target untouched.
    try { sessionStorage.setItem(key, String(Math.round(final))); } catch { /* optional memory */ }
    cleanup();
  };
  const attempt = () => {
    if (cancelled) return;
    // A further navigation moved us off this key — stand down without writing.
    if (keyForLocation() !== key) {
      cleanup();
      return;
    }
    if (settleDeadline === null) {
      if (!eventsSurfaceReady()) {
        if (Date.now() >= readinessDeadline) { finishAtCurrentHeight(); return; }
        frame = requestAnimationFrame(attempt);
        return;
      }
      settleDeadline = Date.now() + RESTORE_WINDOW_MS;
    }
    // Assert only when the FULL target is reachable. Keep asserting through
    // the original settle window so a later native/Next clamp cannot win.
    if (maxPosition() >= stored && Math.abs(window.scrollY - stored) > 2) {
      window.scrollTo({ top: stored, behavior: "instant" as ScrollBehavior });
    }
    if (Date.now() < settleDeadline) {
      frame = requestAnimationFrame(attempt);
      return;
    }
    finishAtCurrentHeight();
  };
  frame = requestAnimationFrame(attempt);
}

// The popstate listener lives at MODULE scope, not in an effect: this
// component sits behind the layout's Suspense boundary, which UNMOUNTS
// it during route transitions — exactly when popstate fires (measured:
// an init-script listener saw the event; the effect-attached one never
// did). A module listener can't be unmounted. By the time popstate
// fires the URL is already the destination, so it can act directly.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { documentDeparted = true; });
  window.addEventListener("pageshow", () => { documentDeparted = false; });
  window.addEventListener("popstate", () => {
    cancelPrimaryTabResume(); // Native Back is distinct from a requested tab resume.
    const key = keyForLocation();
    lastPop = { key, at: Date.now() };
    cancelPendingClear(key);
    restoreFor(key);
  });
  document.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest("a[href]")) {
      // Capture precedes a primary-tab handler creating its own new intent.
      // An explicit link always cancels an older, uncommitted resume request.
      cancelPrimaryTabResume();
    }
  }, true);
}

export default function ScrollMemory() {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = `${KEY_PREFIX}${pathname}${search?.size ? `?${search.toString()}` : ""}`;
  const explicitReturnKey = useRef<string | null>(null);
  const tabReturn = useRef<{ key: string; scrollY: number } | null>(null);
  const pendingFocusReturn = useRef<{ key: string; value: BrowseFocusReturn } | null>(null);

  useEffect(() => {
    // Decide back-vs-fresh for THIS route state. Two back signals: a
    // fresh popstate record for this key (popstate-first ordering), or
    // a document load whose navigation type is back_forward. The
    // popstate-last ordering needs no signal here — the module listener
    // above corrects and cancels the clear on its own.
    if (activeCorrection && activeCorrection.key !== key) activeCorrection.cancel();
    // A Map layout handoff can update the address bar before Next publishes
    // its matching query context. Do not spend the intent on that stale key.
    const tabResume = keyForLocation() === key
      ? consumePrimaryTabResume(`${window.location.pathname}${window.location.search}${window.location.hash}`) : null;
    if (tabResume) tabReturn.current = { key, scrollY: tabResume.scrollY };
    else if (tabReturn.current?.key !== key) tabReturn.current = null;
    const explicitReturn = consumeBrowseScrollReturn(key.slice(KEY_PREFIX.length));
    if (explicitReturn) explicitReturnKey.current = key;
    else if (explicitReturnKey.current !== key) explicitReturnKey.current = null;
    // Strict Mode can replay an effect after consuming device state. Retain
    // the decision for this mounted route, without replaying it on another.
    let back = explicitReturn || explicitReturnKey.current === key || tabReturn.current?.key === key || activeCorrection?.key === key;
    if (back) {
      // Explicit Back and a still-pending module correction both identify this
      // return, even if the destination effect arrives after POP_FRESH_MS.
      consultedDocNav = true;
    } else if (lastPop && lastPop.key === key && Date.now() - lastPop.at < POP_FRESH_MS) {
      back = true;
    } else if (!consultedDocNav) {
      consultedDocNav = true;
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      back = nav?.type === "back_forward";
    }

    if (back) {
      restoreFor(key, tabReturn.current?.key === key ? tabReturn.current.scrollY : undefined);
    } else {
      rememberPrimaryTab(`${window.location.pathname}${window.location.search}${window.location.hash}`, 0);
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
      // Native restoration and preview-height clamps can emit scroll events.
      // They must not replace the captured target while correction is active.
      if (raf || documentDeparted || activeCorrection?.key === key) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (documentDeparted || keyForLocation() !== key || activeCorrection?.key === key) return;
        cancelPendingClear(key);
        try {
          sessionStorage.setItem(key, String(Math.round(window.scrollY)));
        } catch {
          /* ignore */
        }
        rememberPrimaryTab(`${window.location.pathname}${window.location.search}${window.location.hash}`, window.scrollY);
      });
    };
    const cancelQueuedSave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", cancelQueuedSave);
    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", cancelQueuedSave);
      cancelQueuedSave();
    };
  }, [key]);

  useEffect(() => {
    // A full-document Back loses sheet refs. Restore only this consumed native
    // detail transaction, after the actual browse target is stable and ready.
    const initialDocument = !consultedFocusDocNav;
    consultedFocusDocNav = true;
    const navigation = initialDocument
      ? performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
      : undefined;
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (pendingFocusReturn.current?.key !== here) pendingFocusReturn.current = null;
    const value = pendingFocusReturn.current?.value ?? takeBrowseFocusReturn(here,
      navigation?.type === "back_forward" || explicitReturnKey.current === key);
    if (!value) return;
    pendingFocusReturn.current = { key: here, value };
    return restoreBrowseFocusReturn(value, () => { pendingFocusReturn.current = null; });
  }, [key]);

  return null;
}
