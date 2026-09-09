"use client";

import { Fragment } from "react";
import { ChevronRight, Clock3, MapPin } from "lucide-react";

import type { FairDayScheduleItemView } from "./types";

export const FAIR_GRANDSTAND_SPOTLIGHT_IMAGE =
  "/images/fair/fairgrounds-ferris-wheel-mike-d-960.jpg";
export const FAIR_GRANDSTAND_SPOTLIGHT_IMAGE_LARGE =
  "/images/fair/fairgrounds-ferris-wheel-mike-d-1920.jpg";
export const FAIR_GRANDSTAND_SPOTLIGHT_IMAGE_SRC_SET =
  `${FAIR_GRANDSTAND_SPOTLIGHT_IMAGE} 960w, ${FAIR_GRANDSTAND_SPOTLIGHT_IMAGE_LARGE} 1920w`;

export type FairGrandstandSpotlightProps = {
  item: FairDayScheduleItemView;
  onOpen: (itemId: string, opener: HTMLButtonElement) => void;
  compact?: boolean;
};

function compactPlaceLabel(placeLabel: string): string {
  const compact = placeLabel
    .replace(/^Published place:\s*/i, "")
    .replace(/\.$/, "")
    .trim();

  return compact || "Location not published";
}

function spotlightLabel(item: FairDayScheduleItemView): string {
  const isGrandstand = /\bgrandstand\b/i.test(item.placeLabel);
  if (item.kind === "concert" && isGrandstand) return "Grandstand concert";
  if (item.kind === "concert") return "Concert spotlight";
  if (isGrandstand) return "Grandstand spotlight";
  return "Fair program spotlight";
}

function SpotlightTimes({ item }: { item: FairDayScheduleItemView }) {
  if (!item.performanceSlots || item.performanceSlots.length < 2) {
    return (
      <time
        dateTime={
          item.performanceSlots?.[0]?.startsAt ??
          item.sourceItem.startsAt ??
          item.date
        }
      >
        {item.timeLabel}
      </time>
    );
  }

  const ordered = [...item.performanceSlots].sort(
    (left, right) =>
      Number(right.role === "headliner") - Number(left.role === "headliner"),
  );
  return ordered.map((slot, index) => (
    <Fragment key={`${slot.role}-${slot.startsAt}`}>
      {index > 0 ? " · " : null}
      {slot.role === "headliner" ? "Headliner " : "Opener "}
      <time dateTime={slot.startsAt}>{slot.timeLabel}</time>
    </Fragment>
  ));
}

/**
 * A compact visual lead-in for one reviewed item on the selected Fair day.
 * The photograph is owned atmosphere, never event or artist documentation.
 */
export default function FairGrandstandSpotlight({
  item,
  onOpen,
  compact = false,
}: FairGrandstandSpotlightProps) {
  const place = compactPlaceLabel(item.placeLabel);

  return (
    <button
      type="button"
      data-fair-grandstand-spotlight={item.id}
      aria-label={`Open details for ${item.title}, ${item.timeLabel}, ${place}`}
      onClick={(event) => onOpen(item.id, event.currentTarget)}
      className={`tactile relative isolate block ${compact ? "min-h-[148px]" : "min-h-[300px] sm:min-h-[380px]"} w-full cursor-pointer overflow-hidden rounded-[var(--app-radius-xl)] text-left outline-none transition-transform duration-[var(--app-dur-fast)] active:scale-[0.985] motion-reduce:active:scale-100 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--app-bg)]`}
      style={{
        borderColor:
          "color-mix(in srgb, var(--app-accent) 34%, var(--app-border))",
        boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)",
      }}
    >
      {/* The checked-in widths are already optimized, so the browser can choose without a runtime image request. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={FAIR_GRANDSTAND_SPOTLIGHT_IMAGE}
        srcSet={FAIR_GRANDSTAND_SPOTLIGHT_IMAGE_SRC_SET}
        sizes="(min-width: 1024px) 42rem, 100vw"
        alt=""
        aria-hidden="true"
        width="960"
        height="539"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 -z-20 h-full w-full object-cover object-[72%_center]"
      />
      <span
        className="absolute inset-0 -z-10"
        style={{
          background:
            compact
              ? "linear-gradient(90deg, color-mix(in srgb, var(--app-ink) 96%, transparent), color-mix(in srgb, var(--app-ink) 82%, transparent) 52%, color-mix(in srgb, var(--app-ink) 35%, transparent))"
              : "linear-gradient(to top, color-mix(in srgb, var(--app-ink) 96%, transparent), color-mix(in srgb, var(--app-ink) 65%, transparent) 36%, transparent 76%)",
        }}
        aria-hidden="true"
      />

      <span className={`flex max-w-[38rem] flex-col justify-end ${compact ? "min-h-[148px] px-4 py-3" : "min-h-[300px] px-5 py-5 sm:min-h-[380px] sm:px-7 sm:py-6"}`}>
        <span
          className="mb-auto w-fit rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em]"
          style={{
            borderColor:
              "color-mix(in srgb, var(--app-on-brand) 42%, transparent)",
            color: "var(--app-on-brand)",
            background:
              "color-mix(in srgb, var(--app-ink) 72%, transparent)",
          }}
        >
          {spotlightLabel(item)}
        </span>

        <span
          className={`${compact ? "mt-2 text-[26px] sm:text-[30px]" : "mt-16 text-[34px] sm:text-[46px]"} font-extrabold leading-[1.02] tracking-[-0.035em]`}
          style={{ color: "var(--app-on-brand)" }}
        >
          {item.title}
        </span>

        <span
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-bold leading-snug"
          style={{
            color:
              "color-mix(in srgb, var(--app-on-brand) 88%, transparent)",
          }}
        >
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only">Time: </span>
            <SpotlightTimes item={item} />
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only">Place: </span>
            <span>{place}</span>
          </span>
        </span>

        {!compact ? <span
          className="mt-2 inline-flex min-h-6 items-center gap-1 text-[12px] font-extrabold"
          style={{ color: "var(--app-on-brand)" }}
        >
          Open details
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span> : null}
        <span className="mt-2 text-[10px] text-[var(--app-on-brand)]">Fairgrounds photograph · Mike D, 2024</span>
      </span>
    </button>
  );
}
