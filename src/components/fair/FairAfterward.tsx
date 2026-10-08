"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

/**
 * FairAfterward is the Fair guide's Home once the run is over.
 *
 * The page stays an honest record of the 2026 Fair: one sentence says when it
 * ran, Mike D's owned 2024 frames show what it looks like, and the one primary
 * action hands visitors to what is on this weekend. Nothing here describes a
 * current day, forecast, gate or ticket, because none of those exist until the
 * Fair posts its next dates.
 */

export type FairAfterwardMoment = {
  title: string;
  slug: string;
};

export type FairAfterwardFrame = {
  id: string;
  /** Path without the width suffix; the 960 and 1920 JPGs sit beside it. */
  base: string;
  alt: string;
};

export const FAIR_AFTERWARD_FRAMES: readonly FairAfterwardFrame[] = [
  {
    id: "night",
    base: "/images/fair/fairgrounds-night-mike-d",
    alt: "The Great Frederick Fair at night in 2024, seen from above, with the lit Ferris wheel beside the midway and the grandstand crowd.",
  },
  {
    id: "ferris-wheel",
    base: "/images/fair/fairgrounds-ferris-wheel-mike-d",
    alt: "A closer aerial view of the lit Ferris wheel and midway rides at the 2024 Great Frederick Fair.",
  },
  {
    id: "midway",
    base: "/images/fair/fairgrounds-midway-mike-d",
    alt: "The 2024 Great Frederick Fair midway at night, seen from above, with the Ferris wheel, rides and food stands along the main path.",
  },
];

export const FAIR_AFTERWARD_PHOTO_CREDIT = "Photo: Mike D, 2024 fair";

type FrameState = "loading" | "loaded" | "failed";

function AfterwardFrame({
  frame,
  state,
  onState,
}: {
  frame: FairAfterwardFrame;
  state: FrameState;
  onState: (id: string, state: FrameState) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);

  // A server-rendered image can finish before hydration attaches onLoad, so
  // read its settled state once on mount instead of waiting for an event
  // that already fired.
  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    onState(frame.id, image.naturalWidth > 0 ? "loaded" : "failed");
  }, [frame.id, onState]);

  return (
    <li
      data-fair-afterward-frame={frame.id}
      className="w-[80%] shrink-0 snap-start sm:w-auto"
    >
      <figure>
        {/* The picture element keeps these owned files on their own
            960 and 1920 sources instead of the image optimizer. */}
        <picture className="block">
          <img
            ref={imageRef}
            src={`${frame.base}-960.jpg`}
            srcSet={`${frame.base}-960.jpg 960w, ${frame.base}-1920.jpg 1920w`}
            sizes="(min-width: 640px) 15rem, 80vw"
            width={960}
            height={600}
            alt={frame.alt}
            loading="lazy"
            decoding="async"
            onLoad={(event) =>
              onState(
                frame.id,
                event.currentTarget.naturalWidth > 0 ? "loaded" : "failed",
              )
            }
            onError={() => onState(frame.id, "failed")}
            className="aspect-[16/10] w-full rounded-[var(--app-radius-md)] object-cover"
            style={{ background: "var(--app-bg-sunken)" }}
          />
        </picture>
        <figcaption
          className="mt-1.5 min-h-4 text-caption"
          style={{ color: "var(--app-ink-3)" }}
        >
          {state === "loaded" ? FAIR_AFTERWARD_PHOTO_CREDIT : null}
        </figcaption>
      </figure>
    </li>
  );
}

export default function FairAfterward({
  nextMoment = null,
  frames = FAIR_AFTERWARD_FRAMES,
}: {
  /** Another live civic moment, resolved on the server, to hand visitors to. */
  nextMoment?: FairAfterwardMoment | null;
  frames?: readonly FairAfterwardFrame[];
}) {
  const [frameStates, setFrameStates] = useState<
    Readonly<Record<string, FrameState>>
  >({});
  const recordFrameState = useCallback((id: string, state: FrameState) => {
    setFrameStates((current) =>
      current[id] === state ? current : { ...current, [id]: state },
    );
  }, []);
  const visibleFrames = frames.filter(
    (frame) => frameStates[frame.id] !== "failed",
  );

  return (
    <div data-fair-afterward className="pt-1">
      <p className="text-body-lg text-pretty" style={{ color: "var(--app-ink)" }}>
        The 2026 Great Frederick Fair ran September 18 to 26.
      </p>

      {visibleFrames.length > 0 ? (
        <ul
          aria-label="Photos from the 2024 Fair"
          tabIndex={0}
          data-fair-afterward-photos
          className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {visibleFrames.map((frame) => (
            <AfterwardFrame
              key={frame.id}
              frame={frame}
              state={frameStates[frame.id] ?? "loading"}
              onState={recordFrameState}
            />
          ))}
        </ul>
      ) : null}

      <p className="mt-4 text-body text-pretty" style={{ color: "var(--app-ink-2)" }}>
        The 2027 dates appear here when the fair posts them.
      </p>

      <Button
        href="/events?lens=weekend"
        size="lg"
        className="mt-5 w-full sm:w-auto"
        iconRight={<ArrowRight className="h-4 w-4" aria-hidden />}
      >
        {"See what's on this weekend"}
      </Button>

      {nextMoment ? (
        <p className="mt-2">
          <Link
            href={`/moments/${nextMoment.slug}`}
            className="tap-44 inline-flex min-h-11 items-center text-body font-semibold underline underline-offset-4"
            style={{ color: "var(--app-brand-press)" }}
          >
            Open the {nextMoment.title} guide
          </Link>
        </p>
      ) : null}
    </div>
  );
}
