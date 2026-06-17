"use client";

import { useEffect, useRef, useState } from "react";
import { NotebookPen, Pencil, Trash2, Check, X } from "lucide-react";
import { useNote, useSetNote } from "@/hooks/useNotes";

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
    <section
      aria-label="Your notes"
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)", borderLeftWidth: 3, borderLeftColor: "var(--app-cool)" }}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
          <NotebookPen className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-cool)" }} />
          Your notes
        </h3>
        {note && !editing && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={startEdit} aria-label="Edit your note" className="tap-44 grid h-8 w-8 place-items-center rounded-full" style={{ color: "var(--app-ink-3)" }}>
              <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </button>
            <button type="button" onClick={() => setNote(slug, "")} aria-label="Delete your note" className="tap-44 grid h-8 w-8 place-items-center rounded-full" style={{ color: "var(--app-ink-3)" }}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
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
            className="w-full resize-y rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] p-2.5 text-[14px] leading-snug outline-none"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={cancel} className="tap-44 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
              <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Cancel
            </button>
            <button type="button" onClick={save} className="tap-44 inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-semibold" style={{ background: "var(--app-cool)", color: "var(--app-bg)" }}>
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Save note
            </button>
          </div>
        </div>
      ) : note ? (
        <>
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
            {note.text}
          </p>
          <p className="mt-2 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
            Saved on this device
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="tap-44 mt-2.5 flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] border border-dashed py-3 text-[13px] font-semibold"
          style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
        >
          <NotebookPen className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Add a note about this place
        </button>
      )}
    </section>
  );
}
