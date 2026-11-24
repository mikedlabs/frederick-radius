/** Opens the shared feedback sheet from an inline page affordance. */
export const OPEN_FEEDBACK_EVENT = "fr:open-feedback";

/**
 * Keeps an inline feedback request alive if its button hydrates a moment
 * before the shared layout widget. The widget consumes and clears this flag.
 */
export const PENDING_FEEDBACK_KEY = "fr:pending-feedback";

/** Reading and comparing need the full content area on these two pages. */
export function feedbackInMoreMenu(pathname: string | null) {
  return pathname === "/today" || pathname === "/parking";
}

export function requestFeedback(returnFocusTo: HTMLElement) {
  // Touch activation does not necessarily move focus to the invoking control.
  returnFocusTo.focus({ preventScroll: true });
  try {
    window.sessionStorage.setItem(PENDING_FEEDBACK_KEY, "1");
  } catch {
    // The request still reaches an already mounted widget.
  }
  window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT, { detail: { returnFocusTo } }));
}
