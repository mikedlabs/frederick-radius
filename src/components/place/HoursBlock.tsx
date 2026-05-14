"use client";

import { useState } from "react";
import type { Hours } from "@/data/places";
import { formatFullHours, formatTime, getOpenStatus, formatHoursLine } from "@/lib/hours";
import { ChevronDown, AlertCircle } from "lucide-react";

export default function HoursBlock({ hours, verified = false }: { hours?: Hours; verified?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!hours) return null;
  const status = getOpenStatus(hours, { verified });
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
      <div className="px-3 pb-3 pt-1">
        {!verified && (
          <p
            className="mb-2 flex items-start gap-1.5 text-[11px] leading-relaxed"
            style={{ color: "var(--app-warning)" }}
          >
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            <span>
              Hours below are <strong>typical</strong> but not confirmed by the business. Always call ahead.
            </span>
          </p>
        )}
        <ul className="divide-y border-t text-sm" style={{ borderColor: "var(--app-border)" }}>
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
      </div>
    </details>
  );
}
