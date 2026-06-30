"use client";

import { useMode } from "@/hooks/useMode";
import { Home, Compass } from "lucide-react";

export default function ModeToggle() {
  const { mode, setMode } = useMode();
  return (
    <div
      role="radiogroup"
      aria-label="Choose Resident or Visitor mode"
      className="inline-flex items-center gap-1 rounded-full border p-1 text-xs font-medium"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === "resident"}
        onClick={() => setMode("resident")}
        className="tap-44-y inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors"
        style={{
          background: mode === "resident" ? "var(--app-brand)" : "transparent",
          color: mode === "resident" ? "white" : "var(--app-ink-2)",
        }}
      >
        <Home className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /> Resident
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "visitor"}
        onClick={() => setMode("visitor")}
        className="tap-44-y inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors"
        style={{
          background: mode === "visitor" ? "var(--app-cool)" : "transparent",
          color: mode === "visitor" ? "white" : "var(--app-ink-2)",
        }}
      >
        <Compass className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /> Visitor
      </button>
    </div>
  );
}
