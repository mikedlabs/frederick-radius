"use client";

import { useLayoutEffect } from "react";
import { restoreSavedAppearance } from "@/lib/appearance";

/**
 * Keeps a saved dark choice on pages whose document React builds on the
 * client (the not-found and error shells), where the head bootstrap script
 * never runs. A layout effect applies it before the browser paints, so the
 * shell does not show light first. Renders nothing, so there is no markup to
 * mismatch during hydration.
 */
export default function SavedAppearanceRestore() {
  useLayoutEffect(() => { restoreSavedAppearance(); }, []);
  return null;
}
