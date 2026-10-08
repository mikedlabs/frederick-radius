"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, LayoutGrid, ChevronDown } from "lucide-react";
import { haptic } from "@/lib/haptics";
import MotionDisclosure from "@/components/ui/MotionDisclosure";

/**
 * The full category index, placed on Today right after the place shelf. It is
 * a quiet ruled row, closed unless the URL restores a selected answer
 * (/today?want=...). The Find doorway and its four shortcuts answer most
 * visits without putting the product's whole taxonomy above the places.
 *
 * Children ship in the HTML and open without a fetch. The reveal stays
 * visually attached to the row and the closed controls remain inert.
 */
export function shouldOpenBrowseFromSearch(search: string): boolean {
  const want = new URLSearchParams(search).get("want");
  return Boolean(want?.trim());
}

const TITLE = "Browse all kinds of places";

export default function BrowsePlacesDisclosure({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  const [{ open, mounted }, setDisclosure] = useState({
    open: false,
    mounted: false,
  });

  useEffect(() => {
    // The server cannot inspect this client-owned query state. Restore it once
    // after hydration so a shared /today?want= link reveals its answer.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL restore plus honest hydration readiness
    setDisclosure({
      open: shouldOpenBrowseFromSearch(window.location.search),
      mounted: true,
    });
  }, []);

  const toggle = () => {
    haptic("light");
    setDisclosure((value) => ({ ...value, open: !value.open }));
  };

  const panelId = "browse-places-panel";
  // A ruled row, not a card: the title is type, the icon is plain, and the
  // 52px row is the whole target.
  const triggerClass = `flex min-h-[52px] w-full items-center gap-3 border-t px-0.5 py-2 text-left outline-none transition-colors hover:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] ${
    embedded ? "" : "border-b"
  }`;
  const triggerStyle = { borderColor: "var(--app-border)" };
  const triggerLabel = (
    <>
      <LayoutGrid
        aria-hidden
        className="h-5 w-5 shrink-0"
        strokeWidth={2.25}
        style={{ color: "var(--app-ink-2)" }}
      />
      <span className="text-title-sm min-w-0 flex-1" style={{ color: "var(--app-ink)" }}>
        {TITLE}
      </span>
    </>
  );

  return (
    <section
      aria-label="Browse places by category"
      data-surface-row={embedded ? "browse" : undefined}
      className={embedded ? "" : "mt-5"}
    >
      {mounted ? (
        <button
          type="button"
          onClick={toggle}
          data-ready="true"
          aria-expanded={open}
          aria-controls={panelId}
          className={triggerClass}
          style={triggerStyle}
        >
          {triggerLabel}
          <ChevronDown
            className="h-5 w-5 shrink-0 transition-transform duration-200"
            strokeWidth={2.25}
            aria-hidden
            style={{ color: "var(--app-ink-3)", transform: open ? "rotate(180deg)" : "none" }}
          />
        </button>
      ) : (
        <Link
          href="/places"
          prefetch={false}
          className={triggerClass}
          style={triggerStyle}
        >
          {triggerLabel}
          <ArrowRight
            className="h-4 w-4 shrink-0"
            strokeWidth={2.25}
            aria-hidden
            style={{ color: "var(--app-brand-press)" }}
          />
        </Link>
      )}
      <MotionDisclosure
        id={panelId}
        open={open}
        className={embedded ? "border-t border-[var(--app-border)]" : ""}
        innerClassName={embedded ? "px-3 pb-3 pt-3" : "pb-3 pt-3"}
      >
        {children}
      </MotionDisclosure>
    </section>
  );
}
