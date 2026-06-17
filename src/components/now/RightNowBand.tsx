import Link from "next/link";
import { Music } from "lucide-react";

/**
 * RightNowBand — the thin "right now" contextual band above the I-want grid.
 *
 * It surfaces ONLY what's true this minute, as light pills (a live-dot + a
 * calm noun headline + a quiet mono sub-detail), and self-hides entirely when
 * nothing is on. Deliberately a DIFFERENT visual layer from the FieldTag
 * plates below — typography, not boxes, separates "what's happening now" from
 * "what kind of place." A person at 8am on a quiet morning sees no band and
 * the grid leads; at 7pm Friday it reads "Live music tonight · next 7 PM".
 *
 * Server component (plain Links) — zero client cost. Starts with the live-
 * music chip (the wedge); open-late / indoors chips join later.
 */
export default function RightNowBand({
  liveTonight,
}: {
  liveTonight?: { count: number; soonest?: string };
}) {
  const hasLive = Boolean(liveTonight && liveTonight.count > 0);
  if (!hasLive) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/live-music"
        aria-label={
          liveTonight?.soonest
            ? `Live music tonight, next ${liveTonight.soonest}`
            : "Live music tonight"
        }
        className="tap-44 tactile-interactive inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
        style={{
          borderColor: "color-mix(in srgb, var(--app-brand) 32%, var(--app-border))",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-hi)",
        }}
      >
        <span
          aria-hidden
          className="live-dot h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--app-brand)" }}
        />
        <Music className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-brand-press)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
          Live music tonight
        </span>
        {liveTonight?.soonest && (
          <span className="font-mono text-[11px] tracking-tight" style={{ color: "var(--app-ink-3)" }}>
            {liveTonight.soonest}
          </span>
        )}
      </Link>
    </div>
  );
}
