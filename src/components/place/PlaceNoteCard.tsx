"use client";

import { useEffect, useRef, useState } from "react";
import { NotebookPen, Pencil, Trash2, Check, X } from "lucide-react";
import { useNote, useSetNote } from "@/hooks/useNotes";
import { PLACE_SECTION_LABEL_CLASS } from "./PlaceSectionLabel";

/**
 * PlaceNoteCard — the user's OWN field note on a place ("create and save your
 * own field notes"). A margin note for what YOU want to remember: best dish,
 * who to ask for, where to park. Stored on-device (useNotes / localStorage),
 * shown back here and on /my-radius. Distinct from the verified Field Notes
 * card above it — this one's labelled "Your notes" and says it's on-device.
 */
export default function PlaceNoteCard({ slug }: { slug: string }) {
  const note = useNote(slug);
  const setNote = useSetNote();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [mounted, setMounted] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // localStorage-backed — render only after mount to avoid a hydration
  // mismatch (server has no note state).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag; the SSR hydration guard requires a post-mount state flip
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (editing) taRef.current?.focus();
  }, [editing]);

  if (!mounted) return null;

  const startEdit = () => {
    setDraft(note?.text ?? "");
    setEditing(true);
  };
  const save = () => {
    setNote(slug, draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft("");
    setEditing(false);
  };

  return (
    // PLAIN TOOL: an unboxed section; the label and the field carry it.
    <section aria-label="Your notes">
      <header className="flex items-center justify-between gap-2">
        <h3 className={`inline-flex items-center gap-2 ${PLACE_SECTION_LABEL_CLASS}`} style={{ color: "var(--app-ink-3)" }}>
          <NotebookPen className="h-4 w-4" strokeWidth={2} aria-hidden />
          Your notes
        </h3>
        {note && !editing && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={startEdit} aria-label="Edit your note" className="tap-44 grid h-9 w-9 place-items-center rounded-[var(--app-radius-md)]" style={{ color: "var(--app-ink-2)" }}>
              <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <button type="button" onClick={() => setNote(slug, "")} aria-label="Delete your note" className="tap-44 grid h-9 w-9 place-items-center rounded-[var(--app-radius-md)]" style={{ color: "var(--app-ink-2)" }}>
              <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        )}
      </header>

      {editing ? (
        <div className="mt-2.5">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Best dish, who to ask for, where to park, what to come back for…"
            className="w-full resize-y rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] p-2.5 text-[15px] leading-snug"
            style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={cancel} className="tap-44 inline-flex min-h-11 items-center gap-1 rounded-[var(--app-radius-md)] px-3 text-[15px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Cancel
            </button>
            <button type="button" onClick={save} className="tap-44 inline-flex min-h-11 items-center gap-1 rounded-[var(--app-radius-md)] px-4 text-[15px] font-semibold" style={{ background: "var(--app-ink)", color: "var(--app-bg)" }}>
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Save note
            </button>
          </div>
        </div>
      ) : note ? (
        <>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
            {note.text}
          </p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            Saved on this device
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="tap-44 mt-1 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--app-link)" }}
        >
          <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
          Add a note about this place
        </button>
      )}
    </section>
  );
}
