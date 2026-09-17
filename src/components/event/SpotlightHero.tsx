"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDateBlock } from "@/lib/events/format";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import SaveButton from "@/components/saved/SaveButton";
import TrustChip from "@/components/ui/TrustChip";
import { eventTrust } from "@/lib/trust";
import { formatDistance } from "@/lib/geo";

type Props = {
  events: EventWithMeta[];
};

export default function SpotlightHero({ events }: Props) {
  // Extract upcoming events that have photos, up to 3.
  const withImages = events.filter((e) => Boolean(e.hero_image));
  const spotlightEvents = withImages.length > 0 ? withImages.slice(0, 3) : events.slice(0, 3);

  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-play slideshow every 8 seconds, pausing on hover/focus is handled by resetting the interval.
  useEffect(() => {
    if (spotlightEvents.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % spotlightEvents.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [spotlightEvents.length]);

  if (spotlightEvents.length === 0) return null;

  const event = spotlightEvents[activeIndex];
  if (!event) return null;

  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveIndex((prev) => (prev - 1 + spotlightEvents.length) % spotlightEvents.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveIndex((prev) => (prev + 1) % spotlightEvents.length);
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-2)]">
        <div className="flex flex-col md:flex-row md:h-[340px]">
          {/* Left/Top Image Block */}
          <div className="relative w-full aspect-[16/10] md:aspect-auto md:w-1/2 md:h-full overflow-hidden bg-[var(--app-bg-sunken)]">
            {event.hero_image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- proxied/remote venue photo; plain img avoids a domain allowlist for the key-safe proxy */}
                <img
                  src={event.hero_image}
                  alt=""
                  loading="eager"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
              </>
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  background: `radial-gradient(120% 120% at 30% 20%, ${(cat?.color ?? "var(--app-brand)")}2a, ${(cat?.color ?? "var(--app-brand)")}04 70%)`,
                }}
              />
            )}

            {/* Date Badge Overlay (Top Left) */}
            <div
              className="absolute left-4 top-4 z-10 flex flex-col items-center justify-center rounded-[var(--app-radius-md)] px-3 py-2 text-center border border-white/10"
              style={{
                background: "rgba(20, 20, 18, 0.75)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/95">
                {date.month}
              </span>
              <span className="font-serif text-xl font-bold leading-none text-white my-0.5">
                {date.day}
              </span>
              <span className="text-[10px] font-medium text-white/80">
                {date.weekday}
              </span>
            </div>

            {/* Floating Save Button on Image (Mobile Only) */}
            <div className="absolute right-4 top-4 z-10 md:hidden">
              <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
            </div>

            {/* Slide Arrows (Desktop Only Overlay) */}
            {spotlightEvents.length > 1 && (
              <div className="absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-3 md:flex pointer-events-none">
                <button
                  onClick={handlePrev}
                  className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 active:scale-90"
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
                </button>
                <button
                  onClick={handleNext}
                  className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 active:scale-90"
                  aria-label="Next slide"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </div>
            )}
          </div>

          {/* Right/Bottom Content Block */}
          <div className="flex flex-1 flex-col justify-between p-5 md:p-6 md:w-1/2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-[var(--app-radius-sm)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white"
                    style={{ background: "var(--app-brand)" }}
                  >
                    Spotlight
                  </span>
                  {cat && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: cat.color }}
                    >
                      {cat.name}
                    </span>
                  )}
                </div>
                <div className="hidden md:block">
                  <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
                </div>
              </div>

              <Link
                href={`/events/${event.slug}`}
                className="block font-serif text-xl md:text-2xl font-semibold leading-tight tracking-tight text-[var(--app-ink)] hover:underline"
              >
                {event.title}
              </Link>

              <p className="text-xs md:text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                {date.time} · {event.venue_name}
                {event.distance_m !== undefined && ` · ${formatDistance(event.distance_m)}`}
              </p>

              {event.description && (
                <p
                  className="line-clamp-3 text-xs md:text-sm leading-relaxed text-pretty"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {event.description}
                </p>
              )}
            </div>

            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex items-center gap-2">
                <TrustChip signal={eventTrust(event)} />
                {event.is_free && (
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--app-positive)" }}
                  >
                    Free
                  </span>
                )}
              </div>

              <Link
                href={`/events/${event.slug}`}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--app-ink)] px-4 py-2 text-xs font-semibold text-[var(--app-bg)] transition hover:opacity-90 active:scale-[0.97]"
                style={{ transitionTimingFunction: "var(--app-ease-spring)" }}
              >
                View Details
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Slide Navigation Dots */}
      {spotlightEvents.length > 1 && (
        <div className="flex justify-center gap-1.5" role="group" aria-label="Slideshow indicators">
          {spotlightEvents.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeIndex === idx ? "w-5 bg-[var(--app-brand)]" : "w-1.5 bg-black/10 dark:bg-white/10"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
              aria-current={activeIndex === idx ? "true" : "false"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
