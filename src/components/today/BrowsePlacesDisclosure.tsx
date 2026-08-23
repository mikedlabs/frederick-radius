"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, LayoutGrid, ChevronDown } from "lucide-react";
import { haptic } from "@/lib/haptics";
import MotionDisclosure from "@/components/ui/MotionDisclosure";

/**
 * The full category index is the deeper route inside Today's one Find surface.
 * It is intentionally quiet and closed unless the URL restores a selected
 * answer. The everyday search doorway and two urgent shortcuts should answer
 * most visits without exposing the product's entire taxonomy.
 *
 * Children ship in the HTML and open without a fetch. The reveal stays
 * visually attached to the row and the closed controls remain inert.
 */
export function shouldOpenBrowseFromSearch(search: string): boolean {
  const want = new URLSearchParams(search).get("want");
  return Boolean(want?.trim());
}

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
  const triggerClass = `tap-pop flex min-h-11 w-full items-center gap-2.5 border-t px-3 py-2 text-left transition hover:bg-[var(--app-bg-sunken)] ${
    embedded ? "" : "border-b"
  }`;
  const triggerStyle = {
    borderColor: "var(--app-border)",
    // Full-width row: a gentle push-out, not the chip-scale 1.06.
    "--pop": "1.015",
  } as CSSProperties;
  const triggerLabel = (
    <>
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
        style={{ color: "var(--app-brand-press)", background: "var(--app-brand-tint-6)" }}
      >
        <LayoutGrid className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
        {mounted ? "Browse all categories" : "Browse all places"}
      </span>
    </>
  );

  return (
    <section
      aria-label="Browse places by category"
      data-surface-row={embedded ? "browse" : undefined}
      className={embedded ? "" : "mt-3"}
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
        innerClassName={embedded ? "px-3 pb-3 pt-3" : "mt-3"}
      >
        {children}
      </MotionDisclosure>
    </section>
  );
}
