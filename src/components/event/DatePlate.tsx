/** Shared event-calendar specimen mark. */
export default function DatePlate({
  month,
  day,
  weekday,
  accent,
  size = "md",
}: {
  month: string;
  day: string;
  weekday?: string;
  accent: string;
  size?: "sm" | "md";
}) {
  const compact = size === "sm";
  return (
    <div
      aria-hidden
      className={`flex shrink-0 flex-col items-center justify-center self-start rounded-[var(--app-radius-sm)] leading-none ${
        compact ? "min-w-[46px] px-2 py-1" : "h-16 w-16"
      }`}
      style={{
        background: `color-mix(in srgb, ${accent} 12%, var(--app-bg-sunken))`,
        boxShadow: "var(--app-edge), inset 0 1px 0 rgba(255,255,255,0.45)",
      }}
    >
      <span
        className="text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ color: `color-mix(in srgb, ${accent} 55%, var(--app-ink))` }}
      >
        {month}
      </span>
      <span
        className={`font-serif font-semibold ${compact ? "text-[18px]" : "text-xl"}`}
        style={{ color: "var(--app-ink)" }}
      >
        {day}
      </span>
      {weekday ? (
        <span
          className={compact ? "text-[9px] font-medium uppercase" : "mt-0.5 text-[10px]"}
          style={{ color: "var(--app-ink-2)" }}
        >
          {weekday}
        </span>
      ) : null}
    </div>
  );
}
