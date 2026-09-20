import { ArrowUpRight, UtensilsCrossed } from "lucide-react";

type FairGroundsMapMastheadProps = {
  checkedOn?: string;
  selectedDateLabel?: string;
  onBrowseVendors?: () => void;
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
  selectedDateLabel,
  onBrowseVendors,
}: FairGroundsMapMastheadProps) {
  return (
    <div
      data-fair-map-masthead
      className="flex flex-wrap items-end justify-between gap-3 pb-4"
    >
      <div>
        <p
          className="text-[11px] font-extrabold uppercase tracking-[0.16em]"
          style={{ color: "var(--app-brand-press)" }}
        >
          Fair navigator{selectedDateLabel ? ` · ${selectedDateLabel}` : ""}
        </p>
        <h2
          className="mt-1 text-[30px] font-bold leading-[1.05] tracking-[-0.035em]"
          style={{ color: "var(--app-ink)" }}
        >
          Explore the Fair.
        </h2>
        <p
          className="mt-1.5 text-[13px] font-medium leading-snug"
          style={{ color: "var(--app-ink-2)" }}
        >
          Search the grounds or browse Fair vendors.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {checkedOn ? (
          <span
            className="inline-flex items-center gap-2 text-[11px] font-semibold tabular-nums"
            style={{
              color: "var(--app-ink-3)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--app-brand-press)]"
              aria-hidden
            />
            Grounds reviewed {checkedLabel(checkedOn)}
          </span>
        ) : (
          <div
            className="h-8 w-36 animate-pulse rounded-full bg-[var(--app-bg-sunken)] motion-reduce:animate-none"
            aria-hidden
          />
        )}
        {onBrowseVendors ? (
          <button
            type="button"
            onClick={onBrowseVendors}
            className="tap-44 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-bold"
            style={{
              color: "var(--app-on-brand)",
              background: "var(--app-brand-press)",
            }}
          >
            <UtensilsCrossed className="h-4 w-4" aria-hidden />
            Food & vendors
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
