"use client";

import Pill from "@/components/ui/Pill";

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
    <Pill
      active={active}
      count={count}
      size="sm"
      onClick={onClick}
    >
      {label}
    </Pill>
  );
}
