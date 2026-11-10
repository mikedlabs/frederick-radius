/**
 * The one page scroll lock for overlays (sheets, dialogs, lightboxes).
 *
 * The document scrolls on <html>, not <body>: globals.css puts
 * `overflow-x: clip` on both so `position: sticky` pins to the viewport.
 * `document.body.style.overflow = "hidden"` therefore locks nothing here, and
 * would turn body into a scroll container that breaks every sticky element.
 * This locks the real scroll root and never touches body.
 *
 * Holders are counted, so stacked overlays (a lightbox over a sheet) can
 * release in any order and the page unlocks only when the last one lets go.
 */
type RootStyle = Pick<CSSStyleDeclaration, "overflowY" | "paddingRight">;

let holders = 0;
let previous: RootStyle | null = null;

const noop = () => undefined;

/** Lock page scroll. Returns the release function; calling it twice is safe. */
export function acquireScrollLock(): () => void {
  if (typeof document === "undefined") return noop;
  const root = document.documentElement;
  if (holders === 0) {
    previous = { overflowY: root.style.overflowY, paddingRight: root.style.paddingRight };
    // Measure the classic scrollbar before hiding it, then pad the root by the
    // same width so centered content does not jump sideways. Overlay
    // scrollbars (phones) measure 0 and get no padding. `scrollbar-gutter`
    // was measured and does not prevent the shift with the app's 8px
    // ::-webkit-scrollbar. A root with no layout (clientWidth 0) is skipped.
    const scrollbar = root.clientWidth > 0 ? window.innerWidth - root.clientWidth : 0;
    root.style.overflowY = "hidden";
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
  }
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders > 0 || !previous) return;
    root.style.overflowY = previous.overflowY;
    root.style.paddingRight = previous.paddingRight;
    previous = null;
  };
}
