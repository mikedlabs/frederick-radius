"use client";

import { useState } from "react";
import type { Hours } from "@/data/places";
import { formatFullHours, formatTime, getOpenStatus, formatHoursLine } from "@/lib/hours";
import { ChevronDown } from "lucide-react";

export default function HoursBlock({ hours }: { hours?: Hours }) {
  const [open, setOpen] = useState(false);
  if (!hours) return null;
  const status = getOpenStatus(hours);
  const week = formatFullHours(hours);
  return (
    <details
      className="group rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)" }}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 list-none">
        <span className="text-sm font-medium" style={{ color: "var(--app-ink)" }}>
          {formatHoursLine(status)}
        </span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 transition-transform"
          style={{
            color: "var(--app-ink-3)",
            transform: open ? "rotate(180deg)" : "rotate(0)",
          }}
        />
      </summary>
      <ul className="divide-y px-3 pb-3 pt-1 text-sm" style={{ borderColor: "var(--app-border)" }}>
        {week.map((row) => (
          <li key={row.day} className="flex items-center justify-between py-1.5">
            <span style={{ color: "var(--app-ink-2)" }}>{row.label}</span>
            <span className="tabular-nums" style={{ color: "var(--app-ink)" }}>
              {row.windows.length === 0
                ? "Closed"
                : row.windows.map((w) => `${formatTime(w.open)}–${formatTime(w.close)}`).join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
