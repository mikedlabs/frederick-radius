"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Church, X } from "lucide-react";
import { pickCommunityNote, type CommunityNote } from "@/lib/community-notes";
import { getCommunityNotes, setCommunityNotes } from "@/lib/personalize";

// The Pride flag is a real-world symbol, so it keeps its canonical 6-stripe
// colors (a justified exception to the tokens-only rule). Rendered small,
// softened, with a hairline so it reads as a quiet printed flag, not a banner.
const PRIDE_STRIPES = ["#E40303", "#FF8C00", "#FFED00", "#008026", "#004DFF", "#750787"];

function PrideFlag() {
  return (
    <svg
      viewBox="0 0 18 12"
      aria-hidden
      className="h-3 w-[18px] shrink-0 rounded-[2px] opacity-90 ring-1 ring-inset ring-black/10"
    >
      {PRIDE_STRIPES.map((c, i) => (
        <rect key={c} x="0" y={i * 2} width="18" height="2" fill={c} />
      ))}
    </svg>
  );
}

/**
 * CommunityNotes — the governed community layer in the /today masthead. It shows
 * AT MOST ONE quiet, dated community note (Pride Month in June; Sunday places of
 * worship), each linking a real local resource. Even-handed by construction (one
 * calm line per community, on its own honest day) and fully user-governed:
 *
 *   - ON by default, but a single topic-neutral preference (getCommunityNotes)
 *     turns the WHOLE layer off, never one community.
 *   - The dismiss (x) sets that same preference off, so the inline control and
 *     the Settings toggle are the same switch.
 *
 * Client component: it reads the preference + computes the active note from the
 * live client date post-mount, and self-hides (renders null) when the layer is
 * off, dismissed, or no note is active. Server renders nothing, so there is no
 * hydration divergence.
 */
export default function CommunityNotes() {
  const [show, setShow] = useState(false);
  const [note, setNote] = useState<CommunityNote | null>(null);

  useEffect(() => {
    if (!getCommunityNotes()) return; // layer off: stay hidden
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount: read the device preference + live date the server can't see
    setNote(pickCommunityNote(new Date()));
    setShow(true);
  }, []);

  if (!show || !note) return null;

  const dismiss = () => {
    setCommunityNotes(false);
    setShow(false);
  };

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
      {note.icon === "pride-flag" ? (
        <PrideFlag />
      ) : (
        <Church className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-cool)" }} />
      )}
      <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{note.lead}</span>
      <Link href={note.href} className="font-semibold" style={{ color: "var(--app-brand-press)" }}>
        {note.ctaLabel} <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide community notes"
        title="Hide community notes"
        className="tap-44 ml-0.5 inline-flex items-center"
        style={{ color: "var(--app-ink-3)" }}
      >
        <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      </button>
    </p>
  );
}
