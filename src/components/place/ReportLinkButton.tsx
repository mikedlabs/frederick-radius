"use client";

import { useState } from "react";
import { Flag } from "lucide-react";

/**
 * A quiet "Report a broken link" affordance for the commerce section. Click to
 * reveal an optional note + Send; posts to /api/commerce/report-link. Fail-soft
 * by design — it always thanks the user, because the report is best-effort and a
 * dead link shouldn't produce an error dialog.
 */
export default function ReportLinkButton({
  placeSlug,
  placeName,
}: {
  placeSlug: string;
  placeName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  if (state === "done") {
    return (
      <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }} role="status">
        Thanks. We&apos;ll take a look.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-44-y inline-flex items-center gap-1.5 text-[12px] font-medium"
        style={{ color: "var(--app-ink-3)" }}
      >
        <Flag className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        Report a broken link
      </button>
    );
  }

  const send = async () => {
    setState("sending");
    try {
      await fetch("/api/commerce/report-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeSlug,
          placeName,
          note: note.trim() || undefined,
        }),
        keepalive: true,
      });
    } catch {
      /* best-effort; still thank the user */
    }
    setState("done");
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="report-link-note" className="text-[12px]" style={{ color: "var(--app-ink-2)" }}>
        Which link is broken? (optional)
      </label>
      <textarea
        id="report-link-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={280}
        placeholder="e.g. the menu link is dead"
        aria-label="What is broken about this link?"
        className="w-full rounded-[var(--app-radius-sm)] border px-2.5 py-2 text-[13px]"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={state === "sending"}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
          style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
        >
          {state === "sending" ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap-44-y text-[12px] font-medium"
          style={{ color: "var(--app-ink-3)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
