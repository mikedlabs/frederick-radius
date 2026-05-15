"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import SearchOverlay from "@/components/search/SearchOverlay";
import LocationChip from "./LocationChip";

export default function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);

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
