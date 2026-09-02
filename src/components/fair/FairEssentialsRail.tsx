import {
  Accessibility,
  Baby,
  CarFront,
  CircleHelp,
  ShieldAlert,
} from "lucide-react";

const HELP_ITEMS = [
  {
    label: "Family Care + changing",
    answerId: "fair-answer-family-care",
    Icon: Baby,
  },
  {
    label: "Lost person or item",
    answerId: "fair-answer-lost-person-item",
    Icon: ShieldAlert,
  },
  {
    label: "Mobility help",
    answerId: "fair-answer-mobility-help",
    Icon: Accessibility,
  },
] as const;

export default function FairEssentialsRail({
  onOpenHelp,
  onOpenTravel,
}: {
  onOpenHelp: (answerId: string | null) => void;
  onOpenTravel: () => void;
}) {
  return (
    <aside
      className="border-b py-2.5"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
      aria-label="Family essentials"
    >
      <div className="mx-auto max-w-[48rem] px-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <p className="shrink-0 text-[12px] font-bold">Family essentials</p>
          <button
            type="button"
            onClick={() => onOpenHelp(null)}
            className="tap-44 -my-2 inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            Fair help
            <CircleHelp className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="scrollbar-none -mx-4 mt-1 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:-mx-6 sm:px-6">
          {HELP_ITEMS.map((item) => {
            const Icon = item.Icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onOpenHelp(item.answerId)}
                className="tap-44 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold"
                style={{
                  borderColor: "var(--app-border-strong)",
                  color: "var(--app-ink-2)",
                  background: "var(--app-bg)",
                }}
              >
                <Icon
                  className="h-4 w-4"
                  style={{ color: "var(--app-brand-press)" }}
                  aria-hidden
                />
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onOpenTravel}
            className="tap-44 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold"
            style={{
              borderColor: "var(--app-border-strong)",
              color: "var(--app-ink-2)",
              background: "var(--app-bg)",
            }}
          >
            <CarFront
              className="h-4 w-4"
              style={{ color: "var(--app-cool)" }}
              aria-hidden
            />
            Save car
          </button>
        </div>
      </div>
    </aside>
  );
}
