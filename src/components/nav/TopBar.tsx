"use client";

import Link from "next/link";
import { Search, MapPin } from "lucide-react";

export default function TopBar() {
  return (
    <header
      className="sticky top-0 z-30 border-b border-[var(--app-border)] bg-[var(--app-bg)]/85 backdrop-blur-md pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto flex h-14 max-w-screen-md items-center gap-3 px-4">
        <Link
          href="/app/today"
          className="flex items-center gap-2 font-serif text-[17px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full"
            style={{ background: "var(--app-brand)" }}
            aria-hidden
          >
            <Disc />
          </span>
          Radius
        </Link>
        <div
          className="ml-auto flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--app-ink-3)" }}
        >
          <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Frederick, MD
        </div>
        <Link
          href="/app/search"
          aria-label="Search"
          className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-[var(--app-bg-sunken)]"
          style={{ color: "var(--app-ink-2)" }}
        >
          <Search className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </header>
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
