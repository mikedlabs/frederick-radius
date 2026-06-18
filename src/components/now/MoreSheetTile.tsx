"use client";

import { MoreHorizontal } from "lucide-react";
import { craveTileClass, craveTileStyle, CraveTileInner } from "./craveTile";

/**
 * The "I want… More…" tile. Instead of navigating to a page, it OPENS the
 * field-guide "More" drawer (the same MoreSheet the header ••• button opens),
 * which lists every surface of the app — the natural "more options" home.
 * Fires a window event the TopBar listens for, so the drawer's open-state
 * stays owned by the TopBar and this stays a dumb trigger.
 */
export default function MoreSheetTile({ ink = "var(--app-ink-3)" }: { ink?: string }) {
  return (
    <button
      type="button"
      aria-label="More: open the field guide menu"
      className={craveTileClass}
      style={craveTileStyle(ink)}
      onClick={() => window.dispatchEvent(new Event("fr:open-more"))}
    >
      <CraveTileInner icon={MoreHorizontal} label="More…" ink={ink} />
    </button>
  );
}
