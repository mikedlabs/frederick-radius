"use client";

import { Home, Compass } from "lucide-react";
import { useMode } from "@/hooks/useMode";
import { haptic } from "@/lib/haptics";

/**
 * ModeSwitch — the compact, always-visible mode pill the brief
 * requires. Plain labels (Visitor / Resident), one-action switch,
 * resets to that mode's defaults via the consuming component.
 *
 * Distinct from ModeToggle (which lives on /today as a labelled
 * row): this one is small enough to sit inside the map's control
 * deck or a page header without dominating the visual.
 *
 * The caller controls what RESET means (clear the layer set, switch
 * the scope, re-fit the camera, …) via `onChange`. The component
 * only owns the toggle interaction.
 */
export default function ModeSwitch({
  className = "",
  onChange,
}: {
  className?: string;
  /** Fires after the new mode is persisted. Use to reset layer state. */
  onChange?: (next: "visitor" | "resident") => void;
}) {
  const { mode, setMode, mounted } = useMode();

  const handle = (next: "visitor" | "resident") => {
    if (mode === next) return;
    haptic("light");
    setMode(next);
    onChange?.(next);
  };

  // Before mount, we can't tell which mode is persisted. Render the
  // shell with no active pill so the hydration boundary doesn't
  // flicker the wrong selection.
  const active: typeof mode | null = mounted ? mode : null;

  return (
    <div
      role="radiogroup"
      aria-label="Choose Visitor or Resident mode"
      className={`inline-flex items-center gap-0.5 rounded-full border p-0.5 text-[12px] font-semibold ${className}`}
      style={{
        borderColor: "var(--app-border)",
        background: "color-mix(in srgb, var(--app-bg-elevated) 92%, transparent)",
        boxShadow: "var(--app-shadow-1)",
      }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active === "visitor"}
        onClick={() => handle("visitor")}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 transition active:scale-[0.96]"
        style={{
          background: active === "visitor" ? "var(--app-cool)" : "transparent",
          color: active === "visitor" ? "white" : "var(--app-ink-2)",
        }}
      >
        <Compass className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        Visitor
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={active === "resident"}
        onClick={() => handle("resident")}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 transition active:scale-[0.96]"
        style={{
          background: active === "resident" ? "var(--app-brand)" : "transparent",
          color: active === "resident" ? "white" : "var(--app-ink-2)",
        }}
      >
        <Home className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        Resident
      </button>
    </div>
  );
}
