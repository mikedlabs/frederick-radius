/**
 * DatePlate, the one date mark every event surface uses.
 *
 * One look everywhere: a sunken paper plate with a printed edge, the month in
 * Brick-press caps, the day numeral in Ink, the weekday in quiet ink. It is
 * never tinted by category, so a column of plates reads as a calendar instead
 * of a legend of category colors.
 *
 *   sm  44 x 52   the row plate (numeral text-title)
 *   md  56 x 64   the lead plate
 *   lg  72 x 84   a hero or moment plate (numeral display-3)
 *
 * The plate is decorative (aria-hidden): every caller prints the date or time
 * in text beside it.
 */
export type DatePlateSize = "sm" | "md" | "lg";

const PLATE: Record<DatePlateSize, { frame: string; numeral: string }> = {
  sm: { frame: "h-[52px] w-11 gap-1", numeral: "text-title" },
  md: { frame: "h-16 w-14 gap-1", numeral: "display-3" },
  lg: { frame: "h-[84px] w-[72px] gap-1.5", numeral: "display-3" },
};

/** The named type classes carry their own leading; a plate sets lines solid. */
const SOLID = { lineHeight: 1 } as const;

export default function DatePlate({
  month,
  day,
  weekday,
  size = "md",
}: {
  month: string;
  day: string;
  weekday?: string;
  /**
   * Accepted for compatibility with older callers and ignored: the plate is
   * one look on every surface, never tinted by category.
   */
  accent?: string;
  size?: DatePlateSize;
}) {
  const plate = PLATE[size];
  return (
    <div
      aria-hidden
      data-date-plate={size}
      className={`flex shrink-0 flex-col items-center justify-center self-start rounded-[var(--app-radius-sm)] ${plate.frame}`}
      style={{
        background: "var(--app-bg-sunken)",
        boxShadow: "var(--app-edge)",
      }}
    >
      <span
        className="text-caption font-bold uppercase"
        style={{ ...SOLID, color: "var(--app-brand-press)" }}
      >
        {month}
      </span>
      <span
        className={`${plate.numeral} font-semibold tabular-nums`}
        style={{ ...SOLID, color: "var(--app-ink)" }}
      >
        {day}
      </span>
      {weekday ? (
        <span
          className="text-caption"
          style={{ ...SOLID, color: "var(--app-ink-3)" }}
        >
          {weekday}
        </span>
      ) : null}
    </div>
  );
}
