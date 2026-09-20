type FairGroundsMapMastheadProps = {
  checkedOn?: string;
};

function checkedLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export default function FairGroundsMapMasthead({
  checkedOn,
}: FairGroundsMapMastheadProps) {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--app-radius-xl)] border"
      style={{
        borderColor: "var(--app-control-border)",
        background: "var(--app-bg-elevated-solid)",
        boxShadow: "var(--app-edge), var(--app-hi)",
      }}
    >
      <div
        className="absolute bottom-0 left-0 top-0 w-1.5"
        style={{
          background: "var(--app-brand-press)",
        }}
        aria-hidden
      />
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <p
            className="text-[11px] font-extrabold uppercase tracking-[0.16em]"
            style={{ color: "var(--app-brand-press)" }}
          >
            Fair navigator
          </p>
          <h2
            className="mt-1 text-[30px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[35px]"
            style={{
              color: "var(--app-ink)",
            }}
          >
            Find your next stop.
          </h2>
          <p
            className="mt-2 text-[14px] font-semibold leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            Find your way to entrances, essentials, events, and places around
            the grounds.
          </p>
        </div>
        {checkedOn ? (
          <span
            className="inline-flex items-center gap-2 rounded-[var(--app-radius-md)] border px-3 py-2 text-[12px] font-bold tabular-nums"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-ink-2)",
              background: "var(--app-bg-sunken)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--app-brand-press)]"
              aria-hidden
            />
            Reviewed {checkedLabel(checkedOn)}
          </span>
        ) : (
          <div
            className="h-8 w-36 animate-pulse rounded-full bg-[var(--app-bg-sunken)] motion-reduce:animate-none"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
