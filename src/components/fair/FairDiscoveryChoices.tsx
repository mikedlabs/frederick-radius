import { FerrisWheel, PawPrint, Sparkles, UtensilsCrossed } from "lucide-react";

import type { FairDayScheduleItemView } from "./types";

export type FairDiscoveryIntentId =
  | "kid-zone"
  | "animals"
  | "carnival"
  | "food-program";

export function fairDiscoveryIntentMatches(
  item: FairDayScheduleItemView,
  intent: FairDiscoveryIntentId,
): boolean {
  if (intent === "kid-zone") {
    return /\bkid zone\b/i.test(`${item.title} ${item.detail ?? ""}`);
  }
  if (intent === "animals") return item.kind === "animal";
  if (intent === "carnival") return item.kind === "carnival";
  return item.kind === "food";
}

const CHOICES = [
  {
    id: "kid-zone",
    title: "Kid Zone",
    detail: "Free fun for all ages",
    Icon: Sparkles,
    accent: "var(--app-brand-press)",
    wash: "color-mix(in srgb, var(--app-brand) 13%, var(--app-bg-elevated))",
    featured: true,
  },
  {
    id: "animals",
    title: "Animals & livestock",
    detail: "Animal program entries",
    Icon: PawPrint,
    accent: "var(--app-brand-2)",
    wash: "color-mix(in srgb, var(--app-brand-2) 12%, var(--app-bg-elevated))",
    featured: false,
  },
  {
    id: "carnival",
    title: "Carnival & rides",
    detail: "Carnival program entries",
    Icon: FerrisWheel,
    accent: "var(--app-accent-press)",
    wash: "color-mix(in srgb, var(--app-accent) 12%, var(--app-bg-elevated))",
    featured: false,
  },
  {
    id: "food-program",
    title: "Food-related program",
    detail: "Schedule entries, not a vendor list",
    Icon: UtensilsCrossed,
    accent: "var(--app-cool)",
    wash: "color-mix(in srgb, var(--app-cool) 11%, var(--app-bg-elevated))",
    featured: false,
  },
] as const;

export function fairDiscoveryIntentTitle(
  intent: FairDiscoveryIntentId | null,
): string {
  return CHOICES.find((choice) => choice.id === intent)?.title ?? "Program";
}

export default function FairDiscoveryChoices({
  items,
  selected,
  onSelect,
}: {
  items: FairDayScheduleItemView[];
  selected: FairDiscoveryIntentId | null;
  onSelect: (intent: FairDiscoveryIntentId) => void;
}) {
  const availableChoices = CHOICES.map((choice) => ({
    choice,
    count: items.filter((item) =>
      fairDiscoveryIntentMatches(item, choice.id),
    ).length,
  })).filter(({ count }) => count > 0);

  return (
    <section className="mt-5" aria-labelledby="fair-discovery-heading">
      <p
        className="text-[12px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--app-brand-press)" }}
      >
        Start with what sounds good
      </p>
      <h2
        id="fair-discovery-heading"
        className="mt-1 text-[24px] font-extrabold leading-tight tracking-[-0.035em]"
      >
        What do you want to find?
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {availableChoices.map(({ choice, count }) => {
          const active = selected === choice.id;
          const Icon = choice.Icon;

          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(choice.id)}
              className={`tap-44 relative overflow-hidden rounded-[var(--app-radius-lg)] border p-3 text-left transition-[transform,border-color] active:scale-[0.985] motion-reduce:transition-none sm:p-4 ${
                choice.featured
                  ? "col-span-2 min-h-[138px] text-[var(--app-ink-inverse)] sm:min-h-[160px] lg:row-span-2 lg:min-h-[286px]"
                  : choice.id === "food-program" || availableChoices.length === 3
                    ? "col-span-2 min-h-[104px] sm:min-h-[118px] lg:col-span-2"
                    : "min-h-[126px] sm:min-h-[142px]"
              }`}
              style={{
                borderColor: active
                  ? choice.accent
                  : "var(--app-border-strong)",
                background: choice.featured
                  ? "linear-gradient(90deg, color-mix(in srgb, var(--app-ink) 92%, transparent), color-mix(in srgb, var(--app-ink) 28%, transparent)), url('/images/fair/fairgrounds-night-mike-d-960.jpg') 70% 57% / cover"
                  : choice.wash,
                boxShadow: active
                  ? `inset 0 0 0 1px ${choice.accent}`
                  : "var(--app-elev-1)",
              }}
            >
              <span
                className="absolute -right-4 -top-4 h-[78px] w-[78px] rounded-full opacity-25"
                style={{ background: choice.accent }}
                aria-hidden
              />
              <Icon
                className="relative h-6 w-6"
                style={{
                  color: choice.featured
                    ? "var(--app-ink-inverse)"
                    : choice.accent,
                }}
                aria-hidden
              />
              <span className="relative mt-4 block text-[15px] font-bold leading-tight sm:text-[17px]">
                {choice.title}
              </span>
              <span
                className="relative mt-1 block text-[12px] font-medium leading-snug"
                style={{
                  color: choice.featured
                    ? "color-mix(in srgb, var(--app-ink-inverse) 80%, transparent)"
                    : "var(--app-ink-2)",
                }}
              >
                {choice.detail}
              </span>
              <span
                className="relative mt-2 block text-[12px] font-bold tabular-nums"
                style={{
                  color: choice.featured
                    ? "var(--app-ink-inverse)"
                    : choice.accent,
                }}
              >
                {count} {count === 1 ? "thing" : "things"} today
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <button
          type="button"
          onClick={() => onSelect(selected)}
          className="tap-44 mt-2 inline-flex min-h-11 items-center text-[12px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          Clear choice · see the full program
        </button>
      ) : null}
    </section>
  );
}
