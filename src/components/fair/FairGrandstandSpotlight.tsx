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
}: FairGrandstandSpotlightProps) {
  const place = compactPlaceLabel(item.placeLabel);

  return (
    <button
      type="button"
      data-fair-grandstand-spotlight={item.id}
      aria-label={`Open details for ${item.title}, ${item.timeLabel}, ${place}`}
      onClick={(event) => onOpen(item.id, event.currentTarget)}
      className="tactile relative isolate block h-[196px] w-full cursor-pointer overflow-hidden rounded-[var(--app-radius-xl)] border text-left outline-none transition-[transform,box-shadow] duration-[var(--app-dur-fast)] active:scale-[0.985] motion-reduce:active:scale-100 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--app-bg)] sm:h-[208px]"
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
        className="absolute inset-0 -z-20 h-full w-full object-cover object-[72%_center] saturate-[1.06]"
      />
      <span
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(102deg, color-mix(in srgb, var(--app-ink) 94%, transparent) 0%, color-mix(in srgb, var(--app-ink) 78%, transparent) 58%, color-mix(in srgb, var(--app-accent-press) 48%, transparent) 100%), linear-gradient(to top, color-mix(in srgb, var(--app-ink) 92%, transparent), transparent 76%)",
        }}
        aria-hidden="true"
      />

      <span className="flex h-full max-w-[38rem] flex-col justify-end px-4 py-3.5 sm:px-5 sm:py-4">
        <span
          className="mb-auto w-fit rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em]"
          style={{
            borderColor:
              "color-mix(in srgb, var(--app-on-brand) 42%, transparent)",
            color: "var(--app-on-brand)",
            background:
              "color-mix(in srgb, var(--app-accent-press) 72%, transparent)",
          }}
        >
          {spotlightLabel(item)}
        </span>

        <span
          className="line-clamp-2 text-[24px] font-extrabold leading-[1.02] tracking-[-0.025em] sm:text-[28px]"
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

        <span
          className="mt-2 inline-flex min-h-6 items-center gap-1 text-[12px] font-extrabold"
          style={{ color: "var(--app-on-brand)" }}
        >
          Open details
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
