type FairGroundsMapMastheadProps = {
  checkedOn?: string;
  headingId?: string;
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
  headingId,
}: FairGroundsMapMastheadProps) {
  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-xl)] border"
      style={{
        borderColor:
          "color-mix(in srgb, var(--app-brand-press) 22%, var(--app-border))",
        background:
          "radial-gradient(circle at 92% 0%, color-mix(in srgb, var(--app-amber) 13%, transparent), transparent 42%), var(--app-bg-elevated-solid)",
        boxShadow:
          "var(--app-edge), var(--app-hi), 0 20px 42px -38px var(--app-ink)",
      }}
    >
      <div
        className="h-1 w-full"
        style={{
          background:
            "linear-gradient(90deg, var(--app-brand-press) 0 34%, var(--app-amber) 34% 52%, var(--app-brand-2) 52% 68%, var(--app-cool) 68% 84%, var(--app-accent) 84% 100%)",
        }}
        aria-hidden
      />
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5 sm:pt-4">
        <div>
          <p
            className="text-[12px] font-extrabold uppercase tracking-[0.14em]"
            style={{ color: "var(--app-brand-press)" }}
          >
            Source-checked grounds map
          </p>
          <h2
            id={headingId}
            tabIndex={headingId ? -1 : undefined}
            className="mt-1 text-[30px] font-normal leading-[1.02] tracking-[-0.025em] sm:text-[34px]"
            style={{
              fontFamily: "var(--font-editorial)",
              color: "var(--app-ink)",
            }}
          >
            Fairgrounds map
          </h2>
          <p
            className="mt-1.5 text-[13px] font-semibold leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            Find gates, restrooms, buildings, and what is happening there.
          </p>
        </div>
        {checkedOn ? (
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-bold tabular-nums"
            style={{
              borderColor:
                "color-mix(in srgb, var(--app-brand-2) 30%, var(--app-border))",
              color: "var(--app-ink-2)",
              background:
                "color-mix(in srgb, var(--app-brand-2) 6%, var(--app-bg-elevated-solid))",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--app-brand-2)]"
              aria-hidden
            />
            Checked {checkedLabel(checkedOn)}
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
