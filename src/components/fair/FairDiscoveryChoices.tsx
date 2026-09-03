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
    emptyLabel: "No event listed",
    heading: "Kid Zone",
    detail: "Free fun for all ages",
    Icon: Sparkles,
    accent: "var(--app-brand-press)",
    wash: "color-mix(in srgb, var(--app-brand) 13%, var(--app-bg-elevated))",
    featured: true,
  },
  {
    id: "animals",
    title: "Animals",
    emptyLabel: "No event listed",
    heading: "Animals & livestock",
    detail: "Animal program entries",
    Icon: PawPrint,
    accent: "var(--app-brand-2)",
    wash: "color-mix(in srgb, var(--app-brand-2) 12%, var(--app-bg-elevated))",
    featured: false,
  },
  {
    id: "carnival",
    title: "Rides",
    emptyLabel: "No event listed",
    heading: "Carnival & rides",
    detail: "Carnival program entries",
    Icon: FerrisWheel,
    accent: "var(--app-accent-press)",
    wash: "color-mix(in srgb, var(--app-accent) 12%, var(--app-bg-elevated))",
    featured: false,
  },
  {
    id: "food-program",
    title: "Food events",
    emptyLabel: "No food event listed",
    heading: "Food-related program",
    detail: "Schedule entries, not a vendor list",
    Icon: UtensilsCrossed,
    accent: "var(--app-cool)",
    wash: "color-mix(in srgb, var(--app-cool) 11%, var(--app-bg-elevated))",
    featured: false,
  },
] as const;

function scheduleTimestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function concisePreviewTitle(item: FairDayScheduleItemView): string {
  return item.title.split(/\s+[–—-]\s+|:\s+/u)[0]?.trim() || item.title;
}

function compactTimeLabel(label: string): string {
  return label.replace(/\s+-\s+/gu, "–");
}

function compactPreviewStatus(
  status: "Happening now" | "Next" | "On this day",
): "Now" | "Next" | "Listed" {
  if (status === "Happening now") return "Now";
  if (status === "Next") return "Next";
  return "Listed";
}

function previewForChoice(
  matches: FairDayScheduleItemView[],
  asOf: string,
): { item: FairDayScheduleItemView; status: "Happening now" | "Next" | "On this day" } | null {
  if (matches.length === 0) return null;

  const asOfTimestamp = Date.parse(asOf);
  const now = Number.isFinite(asOfTimestamp)
    ? asOfTimestamp
    : Number.NEGATIVE_INFINITY;
  const ordered = [...matches].sort(
    (left, right) =>
      scheduleTimestamp(left.sourceItem.startsAt) -
        scheduleTimestamp(right.sourceItem.startsAt) ||
      left.sourceItem.sourcePosition - right.sourceItem.sourcePosition ||
      left.title.localeCompare(right.title),
  );
  const happeningNow = ordered.find((item) => {
    const startsAt = scheduleTimestamp(item.sourceItem.startsAt);
    const endsAt = scheduleTimestamp(item.sourceItem.endsAt);
    return (
      Number.isFinite(startsAt) &&
      Number.isFinite(endsAt) &&
      startsAt <= now &&
      endsAt >= now
    );
  });
  if (happeningNow) return { item: happeningNow, status: "Happening now" };

  const upcoming = ordered.find((item) => {
    const startsAt = scheduleTimestamp(item.sourceItem.startsAt);
    return Number.isFinite(startsAt) && startsAt >= now;
  });
  if (upcoming) return { item: upcoming, status: "Next" };

  return { item: ordered[0], status: "On this day" };
}

export function fairDiscoveryIntentTitle(
  intent: FairDiscoveryIntentId | null,
): string {
  return CHOICES.find((choice) => choice.id === intent)?.heading ?? "Program";
}

export default function FairDiscoveryChoices({
  items,
  asOf,
  selected,
  onSelect,
}: {
  items: FairDayScheduleItemView[];
  asOf: string;
  selected: FairDiscoveryIntentId | null;
  onSelect: (intent: FairDiscoveryIntentId) => void;
}) {
  const choices = CHOICES.map((choice) => ({
    choice,
    matches: items.filter((item) =>
      fairDiscoveryIntentMatches(item, choice.id),
    ),
  }));

  return (
    <section
      className="mt-3 sm:mt-4"
      aria-label="Fair activity paths"
      data-fair-discovery-choices
    >
      <div
        className="grid grid-cols-2 items-stretch gap-2 sm:gap-3 lg:grid-cols-4"
        data-fair-discovery-grid
      >
        {choices.map(({ choice, matches }) => {
          const active = selected === choice.id;
          const Icon = choice.Icon;
          const preview = previewForChoice(matches, asOf);
          const available = preview !== null;
          const previewTitle = preview
            ? concisePreviewTitle(preview.item)
            : null;
          const previewCopy =
            previewTitle?.toLocaleLowerCase() ===
            choice.title.toLocaleLowerCase()
              ? choice.detail
              : previewTitle;

          return (
            <button
              key={choice.id}
              type="button"
              data-fair-discovery-choice={choice.id}
              disabled={!available}
              aria-pressed={active}
              onClick={() => onSelect(choice.id)}
              className="tap-44 relative min-h-[88px] min-w-0 overflow-hidden rounded-[var(--app-radius-lg)] border p-2.5 text-left transition-[transform,border-color] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-65 motion-reduce:transition-none sm:min-h-[124px] sm:p-3"
              style={{
                borderColor: active
                  ? choice.accent
                  : "var(--app-border-strong)",
                background: choice.featured
                  ? "linear-gradient(90deg, var(--app-bg-elevated-solid) 0%, color-mix(in srgb, var(--app-bg-elevated-solid) 97%, transparent) 48%, color-mix(in srgb, var(--app-bg-elevated-solid) 78%, transparent) 72%, color-mix(in srgb, var(--app-bg-elevated-solid) 18%, transparent) 100%), url('/images/fair/fairgrounds-night-mike-d-960.jpg') 70% 57% / cover"
                  : choice.wash,
                boxShadow: active
                  ? `inset 0 0 0 1px ${choice.accent}`
                  : "var(--app-elev-1)",
              }}
            >
              <span className="relative flex min-w-0 items-start gap-2">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border sm:h-8 sm:w-8"
                  style={{
                    borderColor: "var(--app-border-strong)",
                    background: "var(--app-bg-elevated-solid)",
                  }}
                >
                  <Icon
                    className="h-4 w-4 sm:h-[18px] sm:w-[18px]"
                    style={{ color: choice.accent }}
                    aria-hidden
                  />
                </span>
                <span
                  className="min-w-0 break-words text-[14px] font-extrabold leading-[1.12] tracking-[-0.015em] sm:text-[15px]"
                  data-fair-discovery-copy
                >
                  {choice.title}
                </span>
              </span>
              {available ? (
                <span
                  className="relative mt-1.5 block border-t pt-1.5 sm:mt-2 sm:pt-2"
                  style={{ borderColor: "var(--app-border)" }}
                  data-fair-discovery-preview
                >
                  <span
                    className="block break-words text-[11px] font-bold leading-tight"
                    style={{ color: choice.accent }}
                    data-fair-discovery-copy
                  >
                    <span
                      className="uppercase tracking-[0.07em] sm:hidden"
                      aria-hidden="true"
                    >
                      {compactPreviewStatus(preview.status)}
                    </span>
                    <span className="sr-only sm:not-sr-only sm:uppercase sm:tracking-[0.07em]">
                      {preview.status}
                    </span>
                    <span className="tabular-nums">
                      {" "}· {compactTimeLabel(preview.item.timeLabel)}
                    </span>
                  </span>
                  <span
                    className="sr-only break-words text-[12px] font-semibold leading-[1.25] sm:not-sr-only sm:mt-1 sm:block"
                    style={{ color: "var(--app-ink-2)" }}
                    data-fair-discovery-event-title
                  >
                    {previewCopy}
                  </span>
                </span>
              ) : (
                <span
                  className="relative mt-1.5 block break-words border-t pt-1.5 text-[12px] font-semibold leading-snug sm:mt-2 sm:pt-2"
                  style={{
                    borderColor: "var(--app-border)",
                    color: "var(--app-ink-3)",
                  }}
                  data-fair-discovery-copy
                >
                  <span className="sm:hidden" aria-hidden="true">
                    {choice.emptyLabel}
                  </span>
                  <span className="sr-only sm:not-sr-only">
                    No matching program item this day
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
