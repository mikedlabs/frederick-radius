"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * The third zone of Today — quieter, collapsible "explore more" section
 * containing news, Reddit pulse, browse-by-town etc. Collapsed by default
 * to keep the Today screen scannable; expands on click.
 */
export default function ExploreFooter({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-4 py-3 text-left transition hover:bg-[var(--app-bg-sunken)]"
        style={{ borderColor: "var(--app-border)" }}
        aria-expanded={open}
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            The county
          </p>
          <p className="font-sans text-base font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            {open ? "Less" : "Browse every town & community"}
          </p>
        </div>
        <ChevronDown
          className="h-5 w-5 shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "var(--app-ink-3)" }}
          aria-hidden
        />
      </button>
      {open && <div className="space-y-6 pt-1">{children}</div>}
    </section>
  );
}
