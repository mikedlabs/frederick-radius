/**
 * CategoryBriefing — the counts line at the top of a context-aware category
 * page ("14 coffee spots · 6 open now"). The location half ("Ranked near X" /
 * "Set your town") moved to the shared ScopeBar (components/nav/ScopeBar.tsx)
 * so it's always shown and always changeable — the same control the legacy
 * category page and /open-now use (2026-07-12 beta feedback).
 */
export default function CategoryBriefing({
  categoryName,
  total,
  openNowCount,
}: {
  categoryName: string;
  total: number;
  openNowCount: number;
}) {
  return (
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
  );
}
