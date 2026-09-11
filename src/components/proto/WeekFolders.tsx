"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { WEEK, KIND_LABEL } from "./sampleWeek";

const REVERSED = "var(--app-ink-inverse)";

/**
 * PROTOTYPE: the "peelable week." Each day is a colored field-folder you pull
 * open to reveal its events / deals / happy hours as nested record cards.
 * Accordion (one open at a time) with a framer layout + height animation so
 * the stack physically opens and pushes the rest down.
 */
export default function WeekFolders() {
  const [open, setOpen] = useState<string>("today");
  return (
    <div className="space-y-2">
      {WEEK.map((d) => {
        const isOpen = open === d.key;
        return (
          <motion.section
            key={d.key}
            layout
            className="overflow-hidden rounded-[var(--app-radius-lg)]"
            style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-elev-1), var(--app-edge)" }}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? "" : d.key)}
              aria-expanded={isOpen}
              className="tactile-interactive relative flex w-full items-center gap-4 px-4 py-3.5 text-left"
              style={{ background: d.ink }}
            >
              <div className="shrink-0 text-center">
                <div className="font-mono text-[26px] font-bold leading-none tabular-nums" style={{ color: REVERSED }}>{d.date}</div>
                <div className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: `color-mix(in srgb, ${REVERSED} 68%, transparent)` }}>{d.weekday.slice(0, 3)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[25px] font-semibold leading-none tracking-[-0.01em]" style={{ color: REVERSED }}>{d.label}</div>
                <div className="mt-1.5 font-mono text-[11px] tabular-nums" style={{ color: `color-mix(in srgb, ${REVERSED} 76%, transparent)` }}>{d.items.length} {d.items.length === 1 ? "thing" : "things"} on</div>
              </div>
              <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-300" strokeWidth={2.5} style={{ color: REVERSED, transform: isOpen ? "rotate(180deg)" : "none" }} aria-hidden />
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  <ul className="space-y-2 p-3" style={{ backgroundImage: "var(--app-paper-light)" }}>
                    {d.items.map((it, j) => (
                      <li key={j}>
                        <article className="relative flex items-center gap-3 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] px-3.5 py-2.5" style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-edge), var(--app-hi)" }}>
                          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: d.ink }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: d.ink }}>{KIND_LABEL[it.kind]}</span>
                              <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{it.when}</span>
                            </div>
                            <h3 className="mt-0.5 font-serif text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>{it.title}</h3>
                            <p className="font-mono text-[11px]" style={{ color: "var(--app-ink-2)" }}>{it.venue} · {it.town}</p>
                          </div>
                        </article>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        );
      })}
    </div>
  );
}
