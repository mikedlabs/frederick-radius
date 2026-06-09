import { HISTORY, type HistoryEntry } from "@/data/history";
import { ERAS, TIMELINE_FROM, TIMELINE_TO, eraForYear } from "@/lib/history-era";

/**
 * HistoryTimeline — a horizontal era-colored ribbon that runs across
 * the page. The eye sees the 278-year span at a glance: the Founding
 * sepia band on the left, the deep-brick Civil War band in the
 * middle, the modern blue and contemporary green on the right. Every
 * dated entry (moments + people) plots as a thin tick at its year so
 * the user can feel the density of the period — Civil War years bunch,
 * the Industrial era thins, modern years are dense again.
 *
 * Each tick is an anchor link that jumps to the entry on the same
 * page (we render `#h-<slug>` anchors on the cards). Pure server
 * component — no client JS, no hover state required to read.
 *
 * The ribbon is the page's identity move: the moment a visitor opens
 * /history they see it's a timeline, not an essay.
 */
export default function HistoryTimeline() {
  const datedEntries: Array<HistoryEntry & { _y: number }> = HISTORY
    .filter((e) => typeof e.year === "number")
    .map((e) => ({ ...e, _y: e.year as number }))
    .sort((a, b) => a._y - b._y);

  const span = TIMELINE_TO - TIMELINE_FROM;
  const pct = (year: number) => ((year - TIMELINE_FROM) / span) * 100;

  // Decade ruler marks at the bottom — every 50 years labeled, every
  // 25 a smaller tick. Reads like a museum timeline placard.
  const RULER_LABELED_STEP = 50;
  const RULER_MINOR_STEP = 25;
  const labeledYears: number[] = [];
  const minorYears: number[] = [];
  const firstLabeled = Math.ceil(TIMELINE_FROM / RULER_LABELED_STEP) * RULER_LABELED_STEP;
  for (let y = firstLabeled; y < TIMELINE_TO; y += RULER_LABELED_STEP) labeledYears.push(y);
  const firstMinor = Math.ceil(TIMELINE_FROM / RULER_MINOR_STEP) * RULER_MINOR_STEP;
  for (let y = firstMinor; y < TIMELINE_TO; y += RULER_MINOR_STEP) {
    if (y % RULER_LABELED_STEP !== 0) minorYears.push(y);
  }

  return (
    <section aria-label="Frederick County timeline" className="space-y-2">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span
            aria-hidden
            className="block h-[3px] w-7 rounded-full"
            style={{ background: "var(--app-brand)" }}
          />
          <h2
            className="font-serif text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            The county in {span} years
          </h2>
        </div>
        <p className="text-[11px] uppercase tracking-[0.12em] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {TIMELINE_FROM}–today · {datedEntries.length} markers
        </p>
      </header>

      {/* The ribbon. relative h-[68px] so the rail itself is 32px tall
          and ticks/ruler have generous breathing room above and below. */}
      <div
        className="relative h-[88px] overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        {/* Era bands — colored zones along the rail. Their widths add up
            to 100% so the band edges are the era boundaries. */}
        <div className="absolute inset-x-0 top-7 h-8 overflow-hidden">
          {ERAS.map((era) => {
            const left = pct(era.range.from);
            const width = pct(era.range.to) - left;
            return (
              <div
                key={era.key}
                aria-hidden
                className="absolute top-0 h-full"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: `linear-gradient(180deg, color-mix(in srgb, ${era.color} 28%, transparent), color-mix(in srgb, ${era.color} 14%, transparent))`,
                  borderLeft: `1px solid color-mix(in srgb, ${era.color} 38%, transparent)`,
                }}
              />
            );
          })}
          {/* Era labels along the band — short forms so they fit even
              in the 14%-wide bands on mobile. Full names live in the
              legend below the rail. */}
          {ERAS.map((era) => {
            const mid = (pct(era.range.from) + pct(era.range.to)) / 2;
            return (
              <span
                key={`${era.key}-label`}
                aria-hidden
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-[0.1em] whitespace-nowrap"
                style={{
                  left: `${mid}%`,
                  color: `color-mix(in srgb, ${era.color} 60%, var(--app-ink))`,
                  textShadow: "0 0 4px var(--app-bg-elevated)",
                }}
              >
                {era.shortLabel}
              </span>
            );
          })}
        </div>

        {/* Tick marks for each dated entry, planted above the rail */}
        {datedEntries.map((e) => {
          const era = eraForYear(e._y);
          const isMoment = e.kind === "moment";
          return (
            <a
              key={e.slug}
              href={`#h-${e.slug}`}
              aria-label={`${e.title} (${e._y})`}
              title={`${e.year}: ${e.title}`}
              className="group absolute"
              style={{
                left: `${pct(e._y)}%`,
                top: 4,
                width: isMoment ? 10 : 8,
                height: isMoment ? 22 : 18,
                transform: "translateX(-50%)",
              }}
            >
              <span
                aria-hidden
                className="block h-full w-[2px] mx-auto rounded-full transition-transform group-hover:scale-y-110"
                style={{
                  background: era.color,
                  boxShadow: `0 0 6px color-mix(in srgb, ${era.color} 55%, transparent)`,
                }}
              />
              {/* Larger dot atop the tick to anchor the eye to moments */}
              {isMoment && (
                <span
                  aria-hidden
                  className="absolute left-1/2 -top-1 -translate-x-1/2 h-[7px] w-[7px] rounded-full"
                  style={{
                    background: era.color,
                    boxShadow: `0 0 0 1.5px var(--app-bg-elevated), 0 0 6px color-mix(in srgb, ${era.color} 70%, transparent)`,
                  }}
                />
              )}
            </a>
          );
        })}

        {/* Ruler ticks underneath the band */}
        <div className="absolute inset-x-0 bottom-1 h-6">
          {minorYears.map((y) => (
            <span
              key={`m-${y}`}
              aria-hidden
              className="absolute top-0 h-2 w-px"
              style={{ left: `${pct(y)}%`, background: "var(--app-border)" }}
            />
          ))}
          {labeledYears.map((y) => (
            <span key={`l-${y}`} aria-hidden style={{ position: "absolute", left: `${pct(y)}%`, top: 0 }}>
              <span
                className="block h-3 w-[1.5px]"
                style={{ background: "var(--app-ink-3)" }}
              />
              <span
                className="absolute left-1/2 top-3 -translate-x-1/2 text-[10px] font-semibold tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {y}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Legend reads the era bands explicitly */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        {ERAS.map((era) => (
          <li key={era.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: era.color }}
            />
            <span>
              <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>{era.label}</span>{" "}
              <span className="tabular-nums">
                {era.range.from}
                {era.key === "contemporary" ? "" : `–${era.range.to}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
