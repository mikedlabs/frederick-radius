import { BRAND } from "./brand";

export type Appearance = "light" | "dark";
export const APPEARANCE_KEY = "fr:appearance:v1";
export const APPEARANCE_EVENT = "fr:appearance-change";

export function parseAppearance(value: string | null | undefined): Appearance {
  return value === "dark" ? "dark" : "light";
}

export function getAppearance(): Appearance {
  return parseAppearance(document.documentElement.dataset.appearance);
}

export function applyAppearance(value: Appearance, persist = true): void {
  const root = document.documentElement;
  root.dataset.appearance = value;
  root.style.colorScheme = value;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content", value === "dark" ? BRAND.colors.darkCanvas : BRAND.colors.cream,
  );
  if (persist) {
    try { window.localStorage.setItem(APPEARANCE_KEY, value); } catch { /* Keep the current tab usable when storage is blocked. */ }
  }
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

/** The saved explicit choice, or light when nothing is saved or storage is blocked. */
export function readSavedAppearance(): Appearance {
  try { return parseAppearance(window.localStorage.getItem(APPEARANCE_KEY)); } catch { return "light"; }
}

/**
 * Re-applies the saved choice from the client. The head bootstrap normally
 * does this before first paint, but Next serves a not-found shell
 * that is rendered on the client from the RSC payload, and React never runs
 * a script it inserts. Without this, those pages ignore a saved dark choice.
 * On every other page the bootstrap already applied the same value, so this
 * changes nothing and cannot flash.
 */
export function restoreSavedAppearance(): void {
  const saved = readSavedAppearance();
  if (document.documentElement.dataset.appearance !== saved || document.documentElement.style.colorScheme !== saved) {
    applyAppearance(saved, false);
  }
}

export function subscribeAppearance(notify: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_KEY || event.key === null) applyAppearance(parseAppearance(event.newValue), false);
  };
  window.addEventListener(APPEARANCE_EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
}

// Runs before hydration: a first visit is light even when the OS is dark.
// A deliberate saved choice survives route changes, reloads and app updates.
export const APPEARANCE_BOOTSTRAP = `(function () {
  var appearance = "light";
  try { if (window.localStorage.getItem("${APPEARANCE_KEY}") === "dark") appearance = "dark"; } catch (_) {}
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.style.colorScheme = appearance;
  function updateChrome() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", appearance === "dark" ? "${BRAND.colors.darkCanvas}" : "${BRAND.colors.cream}");
  }
  updateChrome();
  document.addEventListener("DOMContentLoaded", updateChrome, { once: true });
})();`;
