"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { LayoutGrid, ChevronDown } from "lucide-react";
import { haptic } from "@/lib/haptics";

/**
 * BrowsePlacesDisclosure — an OBVIOUS tap target for the "I want…" category
 * browse on /today. It is set as the next index row beneath Ask Radius, rather
 * than another floating card competing with it.
 *
 * Keeps the tap-to-open contract: children (the CravingStrip) ship in the HTML
 * and are display:none until opened, so there is zero fetch and the panel opens
 * instantly. Open state persists per device.
 */
export default function BrowsePlacesDisclosure({ children }: { children: ReactNode }) {
  const KEY = "fr.today.want";
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount localStorage hydration; SSR can't read it
      if (window.localStorage.getItem(KEY) === "true") setOpen(true);
    } catch {
      /* localStorage unavailable — stay closed */
    }
    setMounted(true);
  }, []);

  const toggle = () => {
    haptic("light");
    setOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const panelId = "browse-places-panel";

  return (
    <section aria-label="Browse places by category" className="mt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={mounted ? open : false}
        aria-controls={panelId}
        className="tap-pop flex min-h-[52px] w-full items-center gap-3 border-b px-1 py-2 text-left transition hover:bg-[var(--app-bg-elevated)]"
        style={{
          borderColor: "var(--app-border)",
          // Full-width row: a gentle push-out, not the chip-scale 1.06.
          "--pop": "1.015",
        } as CSSProperties}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
          style={{ boxShadow: "inset 2px 0 0 var(--app-brand)", color: "var(--app-brand)" }}
        >
          <LayoutGrid className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
          Browse by category
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 transition-transform duration-200"
          strokeWidth={2.25}
          aria-hidden
          style={{ color: "var(--app-ink-3)", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      <div id={panelId} hidden={!open} className="mt-3">
        {children}
      </div>
    </section>
  );
}
