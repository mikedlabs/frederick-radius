/**
 * StatStrip — a tactile module of confident tabular numbers.
 *
 * Each stat is a label + a big serif value. The strip carries a
 * soft section-accent radial bloom so it sits dimensional rather
 * than flat. Optional eyebrow above the row scopes the numbers
 * ("Across Frederick County" / "Inside this radius").
 *
 * 1–4 stats supported; the grid columns adapt automatically.
 */
export default function StatStrip({
  stats,
  eyebrow,
}: {
  stats: { label: string; value: number | string }[];
  eyebrow?: string;
}) {
  if (stats.length === 0) return null;
  const cols =
    stats.length === 1
      ? "grid-cols-1"
      : stats.length === 2
      ? "grid-cols-2"
      : stats.length === 3
      ? "grid-cols-3"
      : "grid-cols-4";
  return (
    <section
      aria-label={eyebrow ?? "By the numbers"}
      className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 80% at 10% 0%, color-mix(in srgb, var(--section-accent, var(--app-brand)) 12%, transparent), transparent 60%)",
        }}
      />
      {eyebrow && (
        <p
          className="eyebrow relative"
          style={{ color: "var(--app-ink-3)" }}
        >
          {eyebrow}
        </p>
      )}
      <div className={`relative ${eyebrow ? "mt-3" : ""} grid ${cols} gap-3`}>
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div
              className="font-data text-[28px] font-semibold leading-none tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </div>
            <div
              className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
