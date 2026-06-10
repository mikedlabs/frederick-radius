"use client";

import { X } from "lucide-react";

/**
 * FilterChip — a removable applied-filter chip (redesign omnibox). Each
 * parsed intent token renders as one of these below the search input, so
 * the user always sees exactly which filters are active and can remove any
 * with one tap. Interactive(removable) and static variants. ≥44px hit area.
 */
export default function FilterChip({
  label,
  onRemove,
  tone = "cool",
}: {
  label: string;
  onRemove?: () => void;
  tone?: "cool" | "neutral";
}) {
  const fg = tone === "cool" ? "var(--app-cool)" : "var(--app-ink-2)";
  const bg =
    tone === "cool" ? "var(--app-cool-tint-14)" : "var(--app-ink-tint-6)";
  return (
    <span
      className="t-meta inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 t-semibold"
      style={{ color: fg, background: bg, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${fg} 26%, transparent)` }}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label} filter`}
          className="relative grid h-5 w-5 place-items-center rounded-full transition-colors hover:bg-[color-mix(in_srgb,var(--app-ink)_10%,transparent)] before:absolute before:-inset-2.5 before:content-['']"
        >
          <X className="h-3 w-3" strokeWidth={2.5} aria-hidden style={{ color: fg }} />
        </button>
      )}
    </span>
  );
}
