"use client";

import { useEffect, useState } from "react";
import { NotebookPen } from "lucide-react";
import { useNote } from "@/hooks/useNotes";
import { useSavedTagsFor } from "@/hooks/useSavedTags";
import PlaceNoteCard from "./PlaceNoteCard";
import PlaceListsCard from "./PlaceListsCard";

/**
 * PlaceMarginTools — the two on-device personal cards ("Your notes",
 * "Your lists"), collapsed to ONE quiet affordance while both are empty.
 * A first-time visitor came for the facts, not margin tooling: two empty
 * input cards were eating the first screenful on sparse places (July
 * 2026 audit). Once the user has a note or a list here — or taps to add
 * one — the full cards render exactly as before.
 */
export default function PlaceMarginTools({ slug }: { slug: string }) {
  const note = useNote(slug);
  const tags = useSavedTagsFor(slug);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  // localStorage-backed — render only after mount (no SSR state), same
  // hydration guard the cards themselves use.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag for the SSR hydration guard
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const hasContent = Boolean(note) || tags.length > 0;
  if (!hasContent && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-44 inline-flex items-center gap-2 self-start text-[13px] font-semibold"
        style={{ color: "var(--app-cool)" }}
      >
        <NotebookPen className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        Add a note or list
      </button>
    );
  }

  return (
    <>
      {/* The user's own margin notes for this place (on-device). */}
      <PlaceNoteCard slug={slug} />
      {/* Personal lists ("date night", "takeout") — organize Saved without
          folders; filterable on My Radius (on-device). */}
      <PlaceListsCard slug={slug} />
    </>
  );
}
