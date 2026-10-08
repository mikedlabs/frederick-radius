"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import MotionDisclosure from "@/components/ui/MotionDisclosure";

/**
 * CollapsibleSection — a reusable "hide when not needed, reveal when
 * wanted" section wrapper.
 *
 * Generalizes the proven weather-panel disclosure pattern (WeatherMore /
 * HourlyDisclosure) so any /today section can collapse to a single
 * summary row — title + optional count + chevron — and expand on tap.
 * This is the antidote to the "page goes on forever like a directory"
 * feel: secondary surfaces stay tucked away until the reader asks for
 * them, and the choice is remembered across visits.
 *
 * The trigger is a ruled row, not a caps label: a 52px row under a 1px
 * Border rule, the title in `.text-title-sm` Ink and sentence case, the
 * count in quiet `.text-meta-lg` metadata, and a chevron. Headings are type
 * (docs/brand/BRAND_GUIDE.md), so a stack of disclosures reads as a list of
 * named sections instead of tiny tracked caps. The rule sits on the section
 * itself, so a caller that already draws `border-t` gets one rule, not two.
 *
 * Children remain server-rendered and mounted by default so opening never
 * refetches. Costly browse tails can opt into `mountOnOpen`; those children
 * mount only after an open preference or a deliberate trigger action.
 * MotionDisclosure gives the reveal spatial continuity and makes the closed
 * panel inert, rather than snapping between display:none and visible.
 *
 * SSR-safe: server and first client render both use `defaultOpen`, so
 * there's no hydration mismatch; the stored preference is applied after
 * mount.
 */
export default function CollapsibleSection({
  title,
  count,
  countLabel,
  countAriaOnly = false,
  headingLevel,
  storageKey,
  defaultOpen = false,
  mountOnOpen = false,
  children,
  className = "",
}: {
  title: string;
  /** Optional count shown beside the title (e.g. "6 picks"). */
  count?: number;
  /** Unit label for the count ("picks", "events"). */
  countLabel?: string;
  /** Keep the count for screen readers/SEO (folded into the section
   *  aria-label) but hide it visually — counts are supporting detail, not
   *  a badge competing with the section title. */
  countAriaOnly?: boolean;
  /** Optional semantic heading for sections whose children contain headings. */
  headingLevel?: 2 | 3;
  /** localStorage key so the open/closed choice persists per section. */
  storageKey: string;
  defaultOpen?: boolean;
  /** Defer costly children until this disclosure is opened. Existing sections
   * keep the server-rendered/mounted default unless they explicitly opt in. */
  mountOnOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [contentMounted, setContentMounted] = useState(
    defaultOpen || !mountOnOpen,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let storedOpen: boolean | undefined;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "true" || stored === "false") {
        storedOpen = stored === "true";
      }
    } catch {
      // localStorage unavailable — keep defaultOpen
    }
    queueMicrotask(() => {
      if (storedOpen !== undefined) {
        setOpen(storedOpen);
        if (storedOpen) setContentMounted(true);
      }
      setMounted(true);
    });
  }, [storageKey]);

  const toggle = () => {
    if (!open && mountOnOpen) setContentMounted(true);
    setOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const contentId = `collapsible-${storageKey.replace(/[^a-z0-9]/gi, "-")}`;
  // When the count is aria-only, fold it into the section's accessible name
  // so screen readers and crawlers keep the signal while the eye sees a calm
  // title + chevron.
  const ariaTitle =
    countAriaOnly && typeof count === "number"
      ? `${title} (${count}${countLabel ? ` ${countLabel}` : ""})`
      : title;

  // The 52px minimum is inline so an older caller override such as
  // `[&>h2>button]:min-h-11` cannot shrink the row back to 44px.
  const trigger = (
    <button
      type="button"
      onClick={toggle}
      disabled={!mounted}
      aria-expanded={mounted ? open : defaultOpen}
      aria-controls={contentId}
      data-collapsible-trigger
      style={{ minHeight: 52 }}
      className="flex w-full items-center justify-between gap-3 px-1 py-2 text-left transition-opacity active:opacity-70"
    >
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="text-title-sm text-pretty" style={{ color: "var(--app-ink)" }}>
          {title}
        </span>
        {typeof count === "number" && !countAriaOnly && (
          <span className="text-meta-lg tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {count}
            {countLabel ? ` ${countLabel}` : ""}
          </span>
        )}
      </span>
      <ChevronDown
        className="h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none"
        strokeWidth={2.25}
        aria-hidden
        style={{
          color: "var(--app-ink-2)",
          transform: open ? "rotate(180deg)" : "none",
          transitionTimingFunction: "var(--app-ease-spring)",
        }}
      />
    </button>
  );

  return (
    <section
      aria-label={ariaTitle}
      aria-busy={!mounted}
      data-collapsible-interaction-ready={mounted ? "true" : "false"}
      className={className}
      style={{ borderTop: "1px solid var(--app-border)" }}
    >
      {headingLevel === 2 ? <h2>{trigger}</h2> : headingLevel === 3 ? <h3>{trigger}</h3> : trigger}
      <MotionDisclosure id={contentId} open={open} innerClassName="pt-1.5">
        {contentMounted ? children : null}
      </MotionDisclosure>
    </section>
  );
}
