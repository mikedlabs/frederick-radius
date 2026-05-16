"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Plus, X, Check } from "lucide-react";
import { useLenses, saveCurrentAsLens, removeLens } from "@/hooks/useLenses";
import { isEmptyViewState, type ViewState } from "@/lib/view-state";
import { haptic } from "@/lib/haptics";

/**
 * Saved named views for the events explorer. A lens is a named ViewState
 * (category + town + time window), recalled in one tap and deep-linkable
 * via the URL codec. On-device only. Nothing renders until mounted and
 * there is something to show, so zero lenses === today's behavior.
 */
export default function LensBar({
  current,
  onApply,
}: {
  current: ViewState;
  onApply: (s: ViewState) => void;
}) {
  const lenses = useLenses();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  const canSave = !isEmptyViewState(current);

  function save() {
    const n = name.trim();
    if (!n) return;
    saveCurrentAsLens(n, current);
    setName("");
    setNaming(false);
    haptic("medium");
  }

  function remove(id: string) {
    removeLens(id);
    haptic("light");
  }

  // useSyncExternalStore gives a stable [] server snapshot, so this is
  // hydration-safe without a mounted gate. With no saved lenses and no
  // view to save, render nothing (zero lenses === today's behavior).
  if (lenses.length === 0 && !canSave && !naming) return null;

  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--app-ink-3)" }}
      >
        <Bookmark className="h-3 w-3" strokeWidth={2} aria-hidden />
        Views
      </span>

      {lenses.map((l) => (
        <span
          key={l.id}
          className="inline-flex shrink-0 items-center rounded-full"
          style={{
            background: "var(--app-bg-elevated)",
            border: "1px solid var(--app-border)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              onApply(l.state);
              haptic("light");
            }}
            className="rounded-l-full py-2 pl-3.5 pr-2 text-xs font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            {l.name}
          </button>
          <button
            type="button"
            onClick={() => remove(l.id)}
            aria-label={`Delete view ${l.name}`}
            className="grid h-9 w-7 place-items-center rounded-r-full"
            style={{ color: "var(--app-ink-3)" }}
          >
            <X className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          </button>
        </span>
      ))}

      {naming ? (
        <span
          className="inline-flex shrink-0 items-center rounded-full"
          style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-brand)" }}
        >
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setNaming(false);
                setName("");
              }
            }}
            maxLength={32}
            placeholder="Name this view"
            aria-label="Name this view"
            className="w-36 bg-transparent py-2 pl-3.5 pr-1 text-xs font-semibold outline-none"
            style={{ color: "var(--app-ink)" }}
          />
          <button
            type="button"
            onClick={save}
            disabled={!name.trim()}
            aria-label="Save view"
            className="grid h-9 w-8 place-items-center rounded-r-full disabled:opacity-40"
            style={{ color: "var(--app-brand)" }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        </span>
      ) : (
        canSave && (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
            style={{
              background: "var(--app-bg-elevated)",
              color: "var(--app-brand)",
              border: "1px dashed var(--app-border)",
            }}
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Save this view
          </button>
        )
      )}
    </div>
  );
}
