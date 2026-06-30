"use client";

import { Eye } from "lucide-react";
import { useMounted } from "@/hooks/useSaved";
import { useHiddenSections, useShow, useShowAll } from "@/hooks/useHiddenSections";

/**
 * A quiet footer that lets the user bring hidden Today sections back.
 * Renders nothing until something is actually hidden, so it never adds
 * noise to a fresh page.
 */
export default function HiddenSectionsBar({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const mounted = useMounted();
  const hiddenIds = useHiddenSections();
  const showAll = useShowAll();

  if (!mounted) return null;
  const hidden = sections.filter((s) => hiddenIds.includes(s.id));
  if (hidden.length === 0) return null;

  return (
    <div
      className="rounded-[var(--app-radius-md)] border border-dashed p-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Hidden ({hidden.length})
        </p>
        <button
          type="button"
          onClick={showAll}
          className="tap-44 text-xs font-medium"
          style={{ color: "var(--app-brand)" }}
        >
          Show all
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {hidden.map((s) => (
          <li key={s.id}>
            <RestoreChip label={s.label} id={s.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RestoreChip({ id, label }: { id: string; label: string }) {
  const show = useShow(id);
  return (
    <button
      type="button"
      onClick={show}
      className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
    >
      <Eye className="h-3 w-3" strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}
