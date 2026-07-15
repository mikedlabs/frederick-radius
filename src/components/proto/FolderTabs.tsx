"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

const REVERSED = "var(--app-ink-inverse)";

/**
 * PROTOTYPE: tabbed manila-folder navigation. Sections are colored file-folder
 * tabs; selecting one brings its folder to the front, showing a numbered
 * field-guide table of contents. (The green/yellow folder reference + the
 * numbered Swiss menu, in our material.)
 */
const FOLDERS = [
  { key: "today", label: "Today", ink: "var(--app-brand-2)", items: ["Alive @ Five · Carroll Creek", "½ price wine · Hootch & Banter", "$8 Old Fashioneds · Tenth Ward"] },
  { key: "events", label: "Events", ink: "var(--app-brand-press)", items: ["Frederick Keys vs. Trenton", "First Friday gallery walk", "Sky Stage salsa night", "Farmers Market · Saturday"] },
  { key: "deals", label: "Deals", ink: "var(--app-accent)", items: ["Crab feast $35 · Avery's", "Wine Wednesday 15% · Simple Theory", "Taco Tuesday · Cacique"] },
  { key: "overhead", label: "Overhead", ink: "var(--app-cool)", items: ["8 aircraft in range now", "Boeing 767 inbound, low", "Bell 429 to the south"] },
];

export default function FolderTabs() {
  const [active, setActive] = useState("today");
  const f = FOLDERS.find((x) => x.key === active)!;
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FOLDERS.map((x) => {
          const on = x.key === active;
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => setActive(x.key)}
              aria-pressed={on}
              className="relative shrink-0 rounded-t-[12px] px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] transition"
              style={{
                background: on ? x.ink : `color-mix(in srgb, ${x.ink} 20%, var(--app-bg-elevated-solid))`,
                color: on ? REVERSED : "var(--app-ink-2)",
                marginBottom: -2,
                zIndex: on ? 2 : 1,
              }}
            >
              {x.label}
            </button>
          );
        })}
      </div>
      <div
        className="rounded-[var(--app-radius-lg)] rounded-tl-none border p-4"
        style={{
          borderColor: `color-mix(in srgb, ${f.ink} 45%, var(--app-border))`,
          borderTopWidth: 3,
          borderTopColor: f.ink,
          background: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
          boxShadow: "var(--app-elev-1), var(--app-edge)",
        }}
      >
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{f.label}</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{f.items.length} entries</span>
        </div>
        <ul>
          {f.items.map((it, i) => (
            <li key={i} className="flex items-baseline gap-3 border-t py-3" style={{ borderColor: "var(--app-border)" }}>
              <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: f.ink }}>{String(i).padStart(2, "0")}</span>
              <span className="flex-1 text-[16px] font-medium leading-tight" style={{ color: "var(--app-ink)" }}>{it}</span>
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
