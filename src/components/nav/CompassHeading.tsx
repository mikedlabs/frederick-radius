/**
 * Compass page title. This is a server component on purpose: the heading is
 * static and must paint with the first HTML, not after CompassHub reads
 * device storage or /api/deck.
 */
export function CompassHeading() {
  return (
    <div>
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--app-brand-press)" }}
      >
        Compass
      </p>
      <h1 className="font-editorial mt-1 text-[34px] leading-[0.98] tracking-[-0.03em] sm:text-[38px]">
        What do you need?
      </h1>
    </div>
  );
}
