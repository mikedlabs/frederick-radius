"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { LayoutGrid, ChevronDown } from "lucide-react";
import { haptic } from "@/lib/haptics";

/**
 * BrowsePlacesDisclosure — an OBVIOUS tap target for the "I want…" category
 * browse on /today (owner: the plain text title "didn't make it clear what it
 * is or that it's clickable"). A bordered, elevated card with an icon, an
 * inviting question, and a chevron reads as a button, not a section header.
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
        className="tap-pop flex min-h-11 w-full items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3 text-left"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-elev-1)",
          // Full-width row: a gentle push-out, not the chip-scale 1.06.
          "--pop": "1.015",
        } as CSSProperties}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand) 12%, transparent)", color: "var(--app-brand)" }}
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
