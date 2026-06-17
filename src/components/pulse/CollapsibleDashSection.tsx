"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

/**
 * CollapsibleDashSection — disclosure wrapper around a Pulse section.
 *
 * Mirrors the visual treatment of the inline DashSection on
 * /pulse/page.tsx (left-edge accent band, icon chip in the header,
 * count pill, source attribution) but the body collapses behind a
 * toggle. Built so the noisier sections — 311 reports especially —
 * don't push the genuinely urgent feeds (traffic, power, fire) below
 * the fold.
 *
 * The user's choice is remembered across visits via localStorage
 * (`fr:pulse-${id}-expanded:v1`). Default collapsed for 311 (it's
 * always something, rarely emergency); openable for any caller that
 * wants the user-controlled disclosure pattern.
 *
 * Children render server-side regardless of expanded state — toggling
 * only flips `display:none`, never re-fetches.
 */
export default function CollapsibleDashSection({
  id,
  icon,
  title,
  count,
  accent,
  source,
  summary,
  defaultOpen = false,
  children,
}: {
  id: string;
  /** Pre-rendered icon element. Server → client component boundary
   *  doesn't allow passing the icon component itself (Next strips
   *  function refs), so callers pass <Icon className="..." /> as
   *  the icon prop and we slot it into the header chip. */
  icon: ReactNode;
  title: string;
  count: number;
  accent: string;
  source?: { label: string; href: string };
  /** Short text on the collapsed pill — defaults to "Tap to expand". */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const storageKey = `fr:pulse-${id}-expanded:v1`;
  const [expanded, setExpanded] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate user preference from localStorage after mount; localStorage isn't readable during SSR
      if (stored === "true") setExpanded(true);
      else if (stored === "false") setExpanded(false);
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, [storageKey]);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "true" : "false");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <section
      id={id}
      className="scroll-mt-20 overflow-hidden rounded-[var(--app-radius-lg)] border shadow-[var(--app-shadow-1)]"
      style={{
        // Explicit side colors (not the borderColor shorthand) so the left
        // accent longhand below doesn't trip React's shorthand/longhand warn.
        borderTopColor: "var(--app-border)",
        borderRightColor: "var(--app-border)",
        borderBottomColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        borderLeftWidth: 3,
        borderLeftColor: accent,
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={mounted ? expanded : defaultOpen}
        aria-controls={`${id}-panel`}
        className="flex w-full items-center justify-between gap-3 border-b px-4 py-2.5 text-left transition active:scale-[0.998]"
        style={{ borderColor: expanded ? "var(--app-border)" : "transparent" }}
      >
        <h2
          className="inline-flex min-w-0 items-center gap-2.5 font-serif text-[17px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `color-mix(in srgb, ${accent} 13%, transparent)`,
              color: accent,
            }}
          >
            {icon}
          </span>
          <span className="truncate">{title}</span>
        </h2>
        <span className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
            }}
          >
            {count}
          </span>
          {!expanded && summary && (
            <span
              className="hidden text-[11px] sm:inline"
              style={{ color: "var(--app-ink-3)" }}
            >
              {summary}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 transition-transform"
            strokeWidth={2.25}
            style={{
              color: "var(--app-ink-3)",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </span>
      </button>
      <div
        id={`${id}-panel`}
        hidden={!expanded}
        style={{ display: expanded ? "block" : "none" }}
      >
        <div className="space-y-1.5 px-4 py-3">{children}</div>
        {source && (
          <a
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-4 pb-3 pt-1 text-[10px] uppercase tracking-wide"
            style={{ color: "var(--app-ink-3)" }}
          >
            Source: {source.label}
            <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
          </a>
        )}
      </div>
    </section>
  );
}
