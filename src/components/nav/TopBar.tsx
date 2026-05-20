"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Bookmark } from "lucide-react";
import SearchOverlay from "@/components/search/SearchOverlay";
import LocationChip from "./LocationChip";

/**
 * Auto-hide on scroll: the bar slides up out of view when the user
 * scrolls down past a threshold and slides back in the instant they
 * scroll up — the iOS / Mobile-Safari standard. Hides ~56px of chrome
 * while reading and lets the user reclaim it with a small upward swipe.
 * Always pinned at the top of the document (no flicker at top of page)
 * and during a search overlay.
 */
function useHideOnScroll(disabled: boolean) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);
  useEffect(() => {
    if (disabled) {
      setHidden(false);
      return;
    }
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        if (y < 80) setHidden(false);
        else if (dy > 6) setHidden(true);
        else if (dy < -4) setHidden(false);
        lastY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [disabled]);
  return hidden;
}

export default function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const hidden = useHideOnScroll(searchOpen);

  // Cmd-K / Ctrl-K opens search globally
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      // Forward slash as a quick-open (don't trigger when typing into another input)
      if (e.key === "/" && !searchOpen) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && (e.target as HTMLElement)?.contentEditable !== "true") {
          e.preventDefault();
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  return (
    <>
      <header
        className="sticky top-0 z-30 border-b border-[var(--app-border)] bg-[var(--app-bg)]/85 backdrop-blur-md pt-[env(safe-area-inset-top)]"
        style={{
          transform: hidden ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 240ms var(--app-ease-out)",
          willChange: "transform",
        }}
      >
        <div className="mx-auto flex h-14 max-w-screen-md items-center gap-3 px-4">
          <Link
            href="/"
            aria-label="Frederick Radius — home"
            className="flex items-center gap-2 font-serif text-[16px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full shadow-[var(--app-shadow-1)]"
              style={{ background: "var(--app-brand)" }}
              aria-hidden
            >
              <Disc />
            </span>
            <span className="leading-tight">
              Frederick
              <span className="block text-[10px] font-medium uppercase tracking-[0.14em] -mt-0.5" style={{ color: "var(--app-ink-3)" }}>
                Radius
              </span>
            </span>
          </Link>

          {/* Search trigger — pill button, expands to filled bar on hover */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search places, events, towns"
            className="ml-auto flex h-9 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3 text-sm transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">Search</span>
            <kbd
              className="hidden sm:inline-block rounded border bg-[var(--app-bg-sunken)] px-1 text-[10px] font-medium leading-tight"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              ⌘K
            </kbd>
          </button>

          <Link
            href="/saved"
            aria-label="Saved"
            title="Saved"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-[var(--app-bg-elevated)] transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <Bookmark className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Link>

          <LocationChip />
        </div>
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function Disc() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="white" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="white" />
    </svg>
  );
}
