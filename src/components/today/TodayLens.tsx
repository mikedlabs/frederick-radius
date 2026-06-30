"use client";

import { useMode } from "@/hooks/useMode";
import { useMounted } from "@/hooks/useSaved";
import ModeToggle from "./ModeToggle";

/**
 * TodayLens — the calm, always-visible Resident / Visitor lens picker
 * at the top of /today. It replaces the startup "are you visiting"
 * popup (owner call): instead of interrupting on arrival, the page
 * states the active lens and lets the user switch it in place, so the
 * choice is easy to make AND easy to find later.
 *
 * The lens flavors the whole briefing (which defaults light up, how
 * shared surfaces are scoped, the Visitor "Where to stay" door), so it
 * sits up top, before the content.
 *
 * Client-only and mounted-gated: the selection reflects a per-device
 * choice the server can't know, so we reserve the row's height until
 * mount (no layout shift) rather than flash the wrong lens on hydration.
 */
export default function TodayLens() {
  const { mode } = useMode();
  const mounted = useMounted();

  return (
    <div className="mt-3 flex min-h-[40px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-0.5">
      {mounted && (
        <>
          <p className="text-[12.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Showing the{" "}
            <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>
              {mode === "visitor" ? "visitor" : "resident"}
            </span>{" "}
            view
          </p>
          <ModeToggle />
        </>
      )}
    </div>
  );
}
