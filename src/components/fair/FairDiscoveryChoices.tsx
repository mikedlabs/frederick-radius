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
    matches: items.filter((item) =>
      fairDiscoveryIntentMatches(item, choice.id),
    ),
  })).filter(({ matches }) => matches.length > 0);

  return (
    <section className="mt-5" aria-labelledby="fair-discovery-heading">
      <p
        className="text-[11px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--app-brand-press)" }}
      >
        Explore by mood
      </p>
      <h2
        id="fair-discovery-heading"
        className="mt-1 text-[24px] font-extrabold leading-tight tracking-[-0.035em]"
      >
        What sounds good?
      </h2>

      <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Choose one path. You can change it without losing your day.
      </p>

      <div className="scrollbar-none -mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {availableChoices.map(({ choice, matches }) => {
          const active = selected === choice.id;
          const Icon = choice.Icon;
          const preview = matches[0];

          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(choice.id)}
              className={`tap-44 relative min-h-[158px] w-[78vw] max-w-[18.5rem] shrink-0 snap-start overflow-hidden rounded-[var(--app-radius-lg)] border p-4 text-left transition-[transform,border-color] active:scale-[0.985] motion-reduce:transition-none lg:w-auto ${
                choice.featured ? "text-[var(--app-ink-inverse)]" : ""
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
              <span className="relative flex items-start justify-between gap-3">
                <Icon
                  className="h-6 w-6"
                  style={{
                    color: choice.featured
                      ? "var(--app-ink-inverse)"
                      : choice.accent,
                  }}
                  aria-hidden
                />
                <span
                  className="rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] tabular-nums"
                  style={{
                    borderColor: choice.featured
                      ? "color-mix(in srgb, var(--app-ink-inverse) 42%, transparent)"
                      : "var(--app-border-strong)",
                    color: choice.featured
                      ? "var(--app-ink-inverse)"
                      : choice.accent,
                    background: choice.featured
                      ? "color-mix(in srgb, var(--app-ink) 38%, transparent)"
                      : "var(--app-bg-elevated-solid)",
                  }}
                >
                  {matches.length} {matches.length === 1 ? "option" : "options"}
                </span>
              </span>
              <span className="relative mt-4 block text-[17px] font-bold leading-tight">
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
                className="relative mt-3 block line-clamp-2 text-[12px] font-bold leading-snug tabular-nums"
                style={{
                  color: choice.featured
                    ? "var(--app-ink-inverse)"
                    : choice.accent,
                }}
              >
                {preview.timeLabel} · {preview.title}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
