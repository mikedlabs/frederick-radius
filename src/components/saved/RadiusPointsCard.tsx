import { Compass } from "lucide-react";

/**
 * RadiusPointsCard — placeholder for the coming Radius Points layer.
 *
 * Honest by design: it shows 0 and says "coming soon" rather than faking a
 * score. The framing ties points to the MOAT, not a generic grind — you earn
 * them by exploring the county and contributing the verified local intel
 * (field notes, corrections) that makes the guide worth using. No leaderboard,
 * no streak pressure; a quiet "your contributions will count" marker.
 */
export default function RadiusPointsCard() {
  return (
    <section
      aria-label="Radius Points"
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand) 12%, transparent)", color: "var(--app-brand-press)" }}
        >
          <Compass className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-[16px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              Radius Points
            </span>
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)", color: "var(--app-cool)" }}
            >
              Coming soon
            </span>
          </p>
          <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Earn points for exploring the county and sharing what you know, the
            verified local intel that makes this guide.
          </p>
        </div>
        <span className="shrink-0 font-mono text-[22px] font-semibold tabular-nums" style={{ color: "var(--app-ink-3)" }} aria-label="0 points so far">
          0
        </span>
      </div>
    </section>
  );
}
