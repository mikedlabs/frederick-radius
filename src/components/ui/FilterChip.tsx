"use client";

import { haptic } from "@/lib/haptics";

/**
 * FilterChip — a single-select pill for facet rows (cuisine, and
 * reusable anywhere a "narrow this" control is needed). System Black:
 * brand fill when active, quiet outline when not, an optional count so
 * the user knows how much each choice holds before tapping. The second
 * shared result-presentation primitive after SectionHeading.
 */
export default function FilterChip({
  label,
  count,
  active = false,
  onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        onClick();
      }}
      aria-pressed={active}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition active:opacity-70"
      style={{
        borderColor: active ? "var(--app-brand)" : "var(--app-border)",
        background: active ? "var(--app-brand)" : "var(--app-bg-elevated)",
        color: active ? "#fff" : "var(--app-ink-2)",
      }}
    >
      {label}
      {count !== undefined && (
        <span
          className="tabular-nums"
          style={{ color: active ? "rgba(255,255,255,0.75)" : "var(--app-ink-3)" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
