"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

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
 * Header matches the app's `.eyebrow` section-label register so a
 * collapsed section reads as native page furniture, not a widget.
 *
 * Children are server-rendered as usual and toggled via the `hidden`
 * attribute (display:none) rather than conditional mounting — same
 * tradeoff WeatherMore makes: the markup ships in the HTML (a small
 * byte cost) in exchange for zero layout jump and no client refetch on
 * expand. Using `hidden` (not an overflow-clipped height animation)
 * also means edge-to-edge content (rails with `-mx-4`) isn't clipped.
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
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate stored preference after mount; localStorage isn't readable during SSR
      if (stored === "true" || stored === "false") setOpen(stored === "true");
    } catch {
      // localStorage unavailable — keep defaultOpen
    }
    setMounted(true);
  }, [storageKey]);

  const toggle = () =>
    setOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // ignore
      }
      return next;
    });

  const contentId = `collapsible-${storageKey.replace(/[^a-z0-9]/gi, "-")}`;
  // When the count is aria-only, fold it into the section's accessible name
  // so screen readers and crawlers keep the signal while the eye sees a calm
  // title + chevron.
  const ariaTitle =
    countAriaOnly && typeof count === "number"
      ? `${title} (${count}${countLabel ? ` ${countLabel}` : ""})`
      : title;

  const trigger = (
    <button
      type="button"
      onClick={toggle}
      disabled={!mounted}
      aria-expanded={mounted ? open : defaultOpen}
      aria-controls={contentId}
      className="tap-44 flex w-full items-center justify-between gap-2 px-1 py-1.5 text-left transition active:opacity-70"
    >
      <span className="flex items-baseline gap-2">
        <span className="eyebrow" style={{ color: "var(--app-ink-3)" }}>{title}</span>
        {typeof count === "number" && !countAriaOnly && (
          <span
            className="text-[10px] font-medium uppercase tracking-[0.1em] tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
          >
            {count}
            {countLabel ? ` ${countLabel}` : ""}
          </span>
        )}
      </span>
      <ChevronDown
        className="h-4 w-4 shrink-0 transition-transform duration-200"
        strokeWidth={2.25}
        aria-hidden
        style={{
          color: "var(--app-ink-3)",
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
    >
      {headingLevel === 2 ? <h2>{trigger}</h2> : headingLevel === 3 ? <h3>{trigger}</h3> : trigger}
      <div id={contentId} hidden={!open} className="pt-1.5">
        {children}
      </div>
    </section>
  );
}
