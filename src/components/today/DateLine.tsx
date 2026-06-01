import HomeMuniChip from "./HomeMuniChip";

/**
 * DateLine v2 — calmer typographic header above the SkyHero on /now.
 *
 * v1 was a single uppercase tracked line ("WEDNESDAY · MAY 27 · 7:30
 * PM") that read as a quiet metadata strip. v2 keeps the same role
 * (no editorial verb on top of the weather) but gives each piece
 * its own typographic register:
 *
 *   - Weekday: big serif (Newsreader) — anchors the page in time.
 *   - Date: small caps under the weekday — calendar fact.
 *   - Time: monospace + live pulse dot on the right — "right now".
 *
 * HomeMuniChip still rides bottom-right when a home muni is set.
 * The strip stays on paper-cream (NOT the sky gradient) so styling
 * uses the regular ink tokens instead of sky-toned currentColor.
 */
export default function DateLine() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(now);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {/* Styled like display type but semantically a <p>: the page's
            one <h1> is TodayAsk ("Ask Frederick anything."). Avoids the
            three-<h1> document-hierarchy bug the craft audit flagged. */}
        <p
          className="font-serif text-[26px] font-semibold leading-none tracking-tight sm:text-[30px]"
          style={{ color: "var(--app-ink)" }}
        >
          {weekday}
        </p>
        <p
          className="mt-1 text-meta font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {date}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          aria-hidden
          className="live-dot inline-block"
          style={{ color: "var(--app-brand)" }}
        />
        <span
          className="font-mono text-[14px] font-semibold tabular-nums sm:text-[15px]"
          style={{ color: "var(--app-ink-2)" }}
        >
          {time}
        </span>
        <HomeMuniChip />
      </div>
    </header>
  );
}
