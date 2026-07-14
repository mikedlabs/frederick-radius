import Link from "next/link";
import { Music, ChevronRight } from "lucide-react";

/**
 * RightNowBand — the thin "right now" contextual band above the I-want grid.
 *
 * It surfaces ONLY what's true this minute and self-hides when nothing is on.
 * A DIFFERENT visual layer from the FieldTag plates below — typography, not
 * boxes. The live-music chip used to say only "Live music tonight · 5:00 PM",
 * which told you nothing about WHAT the show is; now it names the soonest act +
 * venue and the count, so the chip answers "what's on" at a glance and the tap
 * into /live-music is informed.
 *
 * Server component (plain Link) — zero client cost.
 */

type Soonest = { title: string; venue?: string | null; time: string };

/** Build the "what it is" sub-line from the soonest show. Leads with the act
 *  when the title is a real name; falls back to the venue when the title is a
 *  generic "Live Music" string (or just echoes the venue). Always ends with
 *  the time. Truncation is handled by the rendering (one line, ellipsis). */
function soonestLine(s: Soonest): string {
  const title = (s.title || "").trim();
  const venue = (s.venue || "").trim();
  const generic = /^(live\s*music|music|live|tbd|tba)\b/i.test(title) || !title;
  // Time leads so the WHEN is never the part that truncates away; then WHAT
  // it is (the act, unless the title is a generic "Live Music"); then WHERE.
  // A generic title falls back to the venue as the "what/where".
  const parts: string[] = [s.time];
  if (!generic) parts.push(title);
  if (venue && venue.toLowerCase() !== title.toLowerCase()) parts.push(venue);
  return parts.filter(Boolean).join(" · ");
}

export default function RightNowBand({
  liveTonight,
}: {
  liveTonight?: { count: number; soonest?: Soonest };
}) {
  const count = liveTonight?.count ?? 0;
  if (count <= 0) return null;
  const soonest = liveTonight?.soonest;
  const sub = soonest ? soonestLine(soonest) : null;

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/live-music"
        prefetch={false}
        aria-label={
          sub
            ? `Live music tonight, ${count} show${count === 1 ? "" : "s"}. Next: ${sub}`
            : "Live music tonight"
        }
        className="tap-44 tactile-interactive flex min-w-0 items-center gap-2.5 rounded-[var(--app-radius-md)] border px-3 py-2"
        style={{
          borderColor: "color-mix(in srgb, var(--app-brand) 32%, var(--app-border))",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-hi)",
        }}
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)" }}
        >
          <Music className="h-3.5 w-3.5" strokeWidth={2.25} style={{ color: "var(--app-brand-press)" }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="live-dot h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--app-brand)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Live music tonight
            </span>
            {count > 1 && (
              <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {count} shows
              </span>
            )}
          </span>
          {sub && (
            <span className="block truncate font-mono text-[11px] leading-tight tracking-tight" style={{ color: "var(--app-ink-3)" }}>
              {count > 1 ? "Next: " : ""}
              {sub}
            </span>
          )}
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 opacity-45" strokeWidth={2} />
      </Link>
    </div>
  );
}
