"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { consumeNativeReturnFocus, getNativeReturn, isCurrentNativeReturn, noNativeReturn, subscribeNativeReturn, type NativeRequestKind, type NativeReturnTarget } from "./native-request-return";

/** Restore only an owned popped entry, once its real input/launcher is mounted. */
export function useNativeRequestReturn({ target, inputKind, inputRef, ready = true, pathname, renderedQuery, onDraft }: {
  target: NativeReturnTarget;
  inputKind?: NativeRequestKind;
  inputRef: RefObject<HTMLElement | null>;
  ready?: boolean;
  pathname?: string;
  renderedQuery?: string;
  onDraft?: (query: string) => void;
}) {
  const value = useSyncExternalStore(subscribeNativeReturn, getNativeReturn, noNativeReturn);
  const restored = useRef<number | null>(null);
  const focusRestored = useRef<number | null>(null);
  useEffect(() => {
    if (!value || !ready || !isCurrentNativeReturn(value) || (pathname && pathname !== window.location.pathname)) return;
    if (renderedQuery !== undefined && (new URL(value.entry.href, window.location.origin).searchParams.get("q") ?? "").trim() !== renderedQuery) return;
    if (inputKind && value.entry.draft?.kind === inputKind && restored.current !== value.sequence) {
      restored.current = value.sequence;
      // Restore editing words, not the URL or results for the current scope.
      queueMicrotask(() => { if (isCurrentNativeReturn(value)) onDraft?.(value.entry.draft!.query); });
    }
    if (value.entry.target !== target || focusRestored.current === value.sequence) return;
    let frame = 0;
    let observer: MutationObserver | undefined;
    let timeout = 0;
    let stopped = false;
    const cleanup = () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.clearTimeout(timeout);
    };
    const focus = () => {
      if (stopped || !isCurrentNativeReturn(value)) { cleanup(); return; }
      const node = inputRef.current;
      if (!node?.isConnected || node.closest('[hidden], [inert], [aria-hidden="true"]')) return;
      const modal = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
        .find((dialog) => !dialog.closest('[hidden], [inert], [aria-hidden="true"]'));
      if (modal && !modal.contains(node)) return;
      node.focus({ preventScroll: true });
      if (document.activeElement === node) { focusRestored.current = value.sequence; cleanup(); consumeNativeReturnFocus(value); }
    };
    // Let the destination's normal mounting/autofocus run first. If an old
    // drawer is still making the destination inert, wait only for that exit.
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        observer = new MutationObserver(focus);
        observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["inert", "hidden", "aria-hidden"] });
        timeout = window.setTimeout(cleanup, 1000);
        focus();
      });
    });
    return cleanup;
  }, [value, ready, pathname, renderedQuery, target, inputKind, inputRef, onDraft]);
}
