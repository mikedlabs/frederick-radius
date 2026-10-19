import { normalizeBrowseReturnTo } from "./browse-return";
import { isResolvableEventSlug } from "./events/resolvable-event-slug";
import { safeRedirectPath } from "./safe-redirect";

export const BROWSE_FOCUS_RETURN_KEY = "fr:browse-focus-return:v1";
export const BROWSE_FOCUS_RETURN_MAX_AGE_MS = 10 * 60_000;
const FOCUS_WAIT_MS = 10_000;
const BASE = new URL("https://frederick-radius.invalid");
type ReturnStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type BrowseFocusIdentity = {
  tagName: "A" | "BUTTON";
  id: string;
  ariaLabel: string | null;
  href: string | null;
};
export type BrowseFocusReturn = {
  v: 1;
  source: string;
  destination: string;
  at: number;
  opener: BrowseFocusIdentity;
};

type LocalFocusReturn = {
  tagName: string;
  id: string;
  ariaLabel: string | null;
  href: string | null;
};

function detailPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 8_192) return null;
  const safe = safeRedirectPath(raw, "/__invalid-detail-return__");
  const url = new URL(safe, BASE);
  const match = /^\/(?:events|places)\/([^/]+)$/.exec(url.pathname);
  return match && isResolvableEventSlug(match[1])
    ? `${url.pathname}${url.search}${url.hash}` : null;
}

function identity(raw: unknown): BrowseFocusIdentity | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<LocalFocusReturn>;
  if (value.tagName !== "A" && value.tagName !== "BUTTON") return null;
  if (typeof value.id !== "string" || value.id.length > 256) return null;
  if (value.ariaLabel !== null && (typeof value.ariaLabel !== "string" || value.ariaLabel.length > 512)) return null;
  if (value.href !== null && (typeof value.href !== "string" || value.href.length > 2_048)) return null;
  if (!value.id && !value.ariaLabel && !value.href) return null;
  // Keep stable public control identity only, never card copy, input values or DOM.
  return { tagName: value.tagName, id: value.id, ariaLabel: value.ariaLabel, href: value.href };
}

/** Called only by an actual unmodified, same-origin sheet detail departure. */
export function markBrowseFocusDeparture(
  destination: string,
  opener: LocalFocusReturn | null,
  storage?: ReturnStorage,
  now = Date.now(),
  source = `${window.location.pathname}${window.location.search}${window.location.hash}`,
): void {
  const from = normalizeBrowseReturnTo(source);
  const to = detailPath(destination);
  const control = identity(opener);
  if (!from || !to || from === to || !control || !Number.isFinite(now)) return;
  try {
    (storage ?? window.sessionStorage).setItem(BROWSE_FOCUS_RETURN_KEY,
      JSON.stringify({ v: 1, source: from, destination: to, at: now, opener: control } satisfies BrowseFocusReturn));
  } catch {
    // Optional device memory must never prevent the native navigation.
  }
}

/** The detail arrival keeps its intent. Only genuine Back or a supported
 * explicit return to the exact source may consume it; a fresh source visit
 * or unrelated route discards it so it cannot steal focus on a later visit. */
export function takeBrowseFocusReturn(
  current: string,
  returning: boolean,
  storage?: ReturnStorage,
  now = Date.now(),
): BrowseFocusReturn | null {
  let target: ReturnStorage | undefined;
  try {
    const activeStorage = storage ?? window.sessionStorage;
    target = activeStorage;
    const serialized = activeStorage.getItem(BROWSE_FOCUS_RETURN_KEY);
    if (serialized === null) return null;
    const discard = () => { activeStorage.removeItem(BROWSE_FOCUS_RETURN_KEY); return null; };
    if (serialized.length > 16_384) return discard();
    const value = JSON.parse(serialized) as Partial<BrowseFocusReturn> | null;
    const age = now - Number(value?.at);
    if (!Number.isFinite(now) || !value || value.v !== 1 || typeof value.at !== "number" || !Number.isFinite(value.at)
      || age < 0 || age > BROWSE_FOCUS_RETURN_MAX_AGE_MS
      || normalizeBrowseReturnTo(value.source) !== value.source
      || detailPath(value.destination) !== value.destination || value.source === value.destination) return discard();
    const opener = identity(value.opener);
    if (!opener) return discard();
    if (current === value.destination) return null;
    if (!returning || current !== value.source) return discard();
    activeStorage.removeItem(BROWSE_FOCUS_RETURN_KEY);
    return { v: 1, source: value.source!, destination: value.destination!, at: value.at, opener };
  } catch {
    try { target?.removeItem(BROWSE_FOCUS_RETURN_KEY); } catch { /* storage is optional */ }
    return null;
  }
}

function visibleControl(node: Element): node is HTMLElement {
  if (!(node instanceof HTMLElement) || !node.isConnected || !node.matches("a[href],button")
    || node.matches(":disabled,[aria-disabled='true']") || node.tabIndex < 0
    || node.closest("[hidden],[inert],[aria-hidden='true']") || node.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
}

/** The local sheet resolver's stable id/href/label contract, restricted to a
 * unique visible actionable control in the new document. Never guess by copy. */
export function resolveBrowseFocusIdentity(saved: BrowseFocusIdentity): HTMLElement | null {
  const candidates = [...document.querySelectorAll(saved.tagName.toLowerCase())];
  if (saved.id) {
    const byId = [...document.querySelectorAll("[id]")].filter(node => node.id === saved.id);
    if (byId.length > 1) return null;
    if (byId.length === 1) {
      const candidate = byId[0];
      return visibleControl(candidate) && candidate.tagName === saved.tagName
        && (!saved.href || candidate.getAttribute("href") === saved.href)
        && (!saved.ariaLabel || candidate.getAttribute("aria-label") === saved.ariaLabel) ? candidate : null;
    }
  }
  const matching = candidates.filter(node => visibleControl(node)
    && (saved.href ? node.getAttribute("href") === saved.href
      : Boolean(saved.ariaLabel && node.getAttribute("aria-label") === saved.ariaLabel))
    && (!saved.ariaLabel || node.getAttribute("aria-label") === saved.ariaLabel));
  return matching.length === 1 ? matching[0] as HTMLElement : null;
}

function browseReady(source: string): boolean {
  const path = new URL(source, BASE).pathname;
  if (path === "/events") {
    const board = document.querySelector("[data-events-interaction-ready]");
    return board?.getAttribute("data-events-interaction-ready") === "true"
      && board.getAttribute("data-events-complete") === "true" && board.getAttribute("aria-busy") === "false";
  }
  if (path === "/nearby") return Boolean(document.querySelector('[data-nearby-interaction-ready="true"]'));
  return true;
}

function competingFocus(): boolean {
  const active = document.activeElement;
  if (active && active !== document.body && active !== document.documentElement) return true;
  return [...document.querySelectorAll("[role='dialog'],aside[data-return-bridge]")].some(node => {
    if (node.closest("[hidden],[inert],[aria-hidden='true']") || node.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

/** Separate from scroll correction: no scroll mutation, no history rewrite,
 * bounded hydration wait, and any newer user intent wins. Lifecycle cleanup
 * does not consume the caller's in-memory Strict Mode replay decision. */
export function restoreBrowseFocusReturn(value: BrowseFocusReturn, finished: () => void): () => void {
  let stopped = false;
  let frame = 0;
  const events = ["pointerdown", "keydown", "wheel", "touchstart", "touchmove"] as const;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
    for (const event of events) window.removeEventListener(event, cancel, true);
  };
  const finish = () => { cleanup(); finished(); };
  const cancel = () => finish();
  const timer = window.setTimeout(finish, FOCUS_WAIT_MS);
  for (const event of events) window.addEventListener(event, cancel, { capture: true, passive: true });
  const attempt = () => {
    if (stopped) return;
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (here !== value.source) { finish(); return; }
    const target = browseReady(value.source) ? resolveBrowseFocusIdentity(value.opener) : null;
    if (target === document.activeElement) { finish(); return; }
    if (competingFocus()) { finish(); return; }
    if (target) {
      target.focus({ preventScroll: true });
      finish();
      return;
    }
    frame = window.requestAnimationFrame(attempt);
  };
  frame = window.requestAnimationFrame(attempt);
  return cleanup;
}
