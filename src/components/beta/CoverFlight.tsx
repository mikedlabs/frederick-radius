"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { FlightSlide } from "@/lib/beta-flight";

/**
 * CoverFlight — the beta cover's photographic plate as a slow flight over
 * the county. Each frame is one of the owner's geo-tagged drone photos;
 * the mono strip inside the frame is the drone's own flight log (fix,
 * altitude, month), and the serif caption beneath states what Radius
 * knows about the ground in frame: places within a half mile, and how
 * many are open at this minute. The rotation is ambient — no controls,
 * no dots — because it is a cover, not a carousel.
 *
 * Motion: ~7s per frame with a 900ms crossfade and a slow push-in on the
 * active frame. prefers-reduced-motion pins the first frame, static.
 * Only the active and next frames mount, so the reel never loads seven
 * full-size photos at once.
 */

const DWELL_MS = 7_000;
const FADE_MS = 900;

function openLine(s: FlightSlide): string {
  if (s.total === 0) return "Radius keeps watch over the whole county from here.";
  const places = s.total === 1 ? "1 place" : `${s.total} places`;
  const open =
    s.open === 0 ? "None are open right now."
    : s.open === 1 ? "1 is open right now."
    : `${s.open} are open right now.`;
  return `Radius knows the ${places} within a half mile of this frame. ${open}`;
}

export default function CoverFlight({ slides }: { slides: FlightSlide[] }) {
  const [active, setActive] = useState(0);
  // Lazy init, WeatherRadar's pattern: no setState-in-effect, and the
  // server value (false) only differs for reduced-motion users, whose
  // first client render immediately pins frame zero.
  const [reduced] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reduced || slides.length < 2) return;
    timer.current = setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, DWELL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, slides.length]);

  if (slides.length === 0) return null;
  const current = slides[reduced ? 0 : active];
  const nextIdx = (active + 1) % slides.length;

  return (
    <figure className="mx-auto mt-6 w-full">
      <div
        className="relative overflow-hidden border"
        style={{ borderColor: "var(--app-ink-tint-12, rgba(22,20,14,.25))", aspectRatio: "16 / 10" }}
      >
        {slides.map((s, i) => {
          const isActive = i === (reduced ? 0 : active);
          // Mount only the frame on screen and the one about to arrive.
          if (!isActive && !(i === nextIdx && !reduced)) return null;
          return (
            <div
              key={s.src}
              className="absolute inset-0"
              style={{
                opacity: isActive ? 1 : 0,
                transition: `opacity ${FADE_MS}ms ease`,
              }}
            >
              <Image
                src={s.src}
                alt=""
                fill
                priority={i === 0}
                sizes="(min-width: 640px) 28rem, 100vw"
                className="object-cover"
                style={
                  isActive && !reduced
                    ? { animation: `fr-flight-push ${DWELL_MS + FADE_MS}ms linear both` }
                    : undefined
                }
              />
            </div>
          );
        })}
        {/* the drone's own flight log, in the instrument voice */}
        <p
          className="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-3 px-3 pb-2 pt-8 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-white/95"
          style={{ background: "linear-gradient(180deg, transparent, rgba(12,10,6,0.6))" }}
        >
          <span className="whitespace-nowrap">{current.coordLabel}</span>
          {current.flightLabel && <span className="shrink-0 whitespace-nowrap">{current.flightLabel}</span>}
        </p>
        <style>{`
          @keyframes fr-flight-push { from { transform: scale(1); } to { transform: scale(1.055); } }
          @media (prefers-reduced-motion: reduce) { [style*="fr-flight-push"] { animation: none !important; } }
        `}</style>
      </div>
      <figcaption
        className="mt-2 text-center font-serif text-[13.5px] italic [text-wrap:balance]"
        style={{ color: "var(--app-ink-2)" }}
      >
        {openLine(current)}
      </figcaption>
      <span className="sr-only">
        Aerial photographs of Frederick County taken by the guide&apos;s own drone, with live
        counts of nearby places.
      </span>
    </figure>
  );
}
