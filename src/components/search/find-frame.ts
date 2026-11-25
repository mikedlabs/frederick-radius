import type { CSSProperties } from "react";

/**
 * The outer frame of Find: the dialog root, the scrim behind it and the panel.
 *
 * The header draws this frame while the Find chunk is still loading and
 * SearchOverlay draws it once the chunk is present. Both read these values, so
 * the loading state is the same panel over the same scrim and the swap moves
 * nothing. On a phone the root is the page ground and the panel fills the
 * screen. From the sm breakpoint the root is transparent, the scrim shows and
 * the panel is a centered sheet with one fixed height.
 *
 * Keep this module free of imports from SearchOverlay. The persistent header
 * reads it, and the overlay must stay out of the shell bundle.
 */
export const FIND_FRAME_ROOT_CLASS =
  "fixed inset-0 z-[var(--z-overlay)] flex items-start justify-center bg-[var(--app-bg)] sm:bg-transparent";

export const FIND_FRAME_ROOT_STYLE: CSSProperties = {
  paddingLeft: "env(safe-area-inset-left, 0px)",
  paddingRight: "env(safe-area-inset-right, 0px)",
};

export const FIND_FRAME_SCRIM_CLASS =
  "absolute inset-0 hidden bg-black/40 backdrop-blur-[2px] sm:block";

export const FIND_FRAME_PANEL_CLASS =
  "relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden sm:mt-[8dvh] sm:h-[min(84dvh,46rem)] sm:max-w-screen-sm sm:rounded-[var(--app-radius-lg)] sm:border sm:border-[var(--app-border)] sm:shadow-[var(--app-shadow-3)]";

export const FIND_FRAME_PANEL_STYLE: CSSProperties = {
  background: "var(--app-bg)",
};

/** The title row inside the panel, shared so the heading does not shift. */
export const FIND_FRAME_HEADER_CLASS =
  "flex min-h-14 items-center justify-between gap-3 px-4 sm:px-5";

export const FIND_FRAME_HEADER_STYLE: CSSProperties = {
  paddingTop: "env(safe-area-inset-top, 0px)",
};
