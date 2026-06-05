import SetTownInline from "./SetTownInline";

/**
 * CategoryBriefing — the honest "what am I looking at, and what is this
 * ranked from" line at the top of a context-aware category page. Counts
 * (total · open now) plus a ranking-context statement that is NEVER
 * silently downtown: either "Ranked near {town}" or the explicit default
 * with a one-tap set-town.
 */
export default function CategoryBriefing({
  categoryName,
  total,
  openNowCount,
  town,
  color,
  municipalities,
}: {
  categoryName: string;
  total: number;
  openNowCount: number;
  /** The user's resolved town, or null when unknown (honest default). */
  town: { slug: string; name: string } | null;
  color: string;
  municipalities: { slug: string; name: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>
        <span className="font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
          {total}
        </span>{" "}
        {categoryName.toLowerCase()} spot{total === 1 ? "" : "s"}
        {openNowCount > 0 && (
          <>
            {" · "}
            <span className="font-semibold" style={{ color: "var(--app-positive)" }}>
              {openNowCount} open now
            </span>
          </>
        )}
      </p>
      {town ? (
        <p
          className="inline-flex items-center gap-1.5 text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          Ranked near {town.name}
        </p>
      ) : (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span>Using Downtown Frederick as the default — set your town for nearby results.</span>
          <SetTownInline municipalities={municipalities} />
        </div>
      )}
    </div>
  );
}
