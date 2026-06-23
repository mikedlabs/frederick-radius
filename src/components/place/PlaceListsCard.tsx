"use client";

import { useEffect, useState } from "react";
import { ListPlus, X, Plus } from "lucide-react";
import { useSavedTagsFor, useToggleSavedTag, normalizeListLabel } from "@/hooks/useSavedTags";

/**
 * PlaceListsCard — the user's OWN lists for a place ("date night", "takeout",
 * "rainy day"). Personal collections without folders: label a place and filter
 * by that label on /my-radius. On-device (useSavedTags / localStorage), mirrors
 * the "Your notes" card. A few common labels are offered as one-tap suggestions.
 */
const SUGGESTIONS = ["date night", "takeout", "rainy day", "with kids", "coffee run", "weekend"];

export default function PlaceListsCard({ slug }: { slug: string }) {
  const tags = useSavedTagsFor(slug);
  const toggle = useToggleSavedTag();
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");

  // localStorage-backed — render only after mount (no SSR state).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag for the SSR hydration guard
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const add = () => {
    const label = normalizeListLabel(draft);
    if (label && !tags.includes(label)) toggle(slug, label);
    setDraft("");
  };
  const openSuggestions = SUGGESTIONS.filter((s) => !tags.includes(s));

  return (
    <section
      aria-label="Your lists"
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)", borderLeftWidth: 3, borderLeftColor: "var(--app-accent)" }}
    >
      <h3 className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
        <ListPlus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-accent-press)" }} />
        Your lists
      </h3>

      {tags.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => toggle(slug, t)}
                aria-label={`Remove from ${t}`}
                className="tap-44 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-medium"
                style={{ borderColor: "var(--app-accent)", background: "color-mix(in srgb, var(--app-accent) 12%, transparent)", color: "var(--app-accent-press)" }}
              >
                {t}
                <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          maxLength={24}
          placeholder="Add to a list…"
          aria-label="Add this place to one of your lists"
          className="min-w-0 flex-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] px-2.5 py-1.5 text-[13px] outline-none"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!normalizeListLabel(draft)}
          aria-label="Add list"
          className="tap-44 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
          style={{ background: "var(--app-accent-press)", color: "var(--app-bg)" }}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Add
        </button>
      </div>

      {openSuggestions.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {openSuggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => toggle(slug, s)}
                className="tap-44 inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[12px]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
              >
                <Plus className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
        Saved on this device · filter by list on My Radius
      </p>
    </section>
  );
}
