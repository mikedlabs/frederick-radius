"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

export type EventSlide = {
  slug: string;
  title: string;
  when: string;
  venue: string;
  eyebrow: string;
  /** Real venue photo, or null → on-brand category gradient. */
  photo: string | null;
  categoryName: string;
  color: string;
};

/**
 * Rotating, photo-forward featured hero for what's going on in the city.
 * Auto-advances every 5s, pauses on touch/hover, swipeable, with dots.
 * Each slide borrows its venue's real photo where we have one.
 */
export default function FeaturedEvents({ events }: { events: EventSlide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const startX = useRef<number | null>(null);
  const n = events.length;

  useEffect(() => {
    if (n <= 1 || paused) return;
    const t = setInterval(() => setI((p) => (p + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n, paused]);

  if (n === 0) return null;
  const e = events[Math.min(i, n - 1)];

  const go = (next: number) => setI(((next % n) + n) % n);

  return (
    <div
      className="relative overflow-hidden rounded-[var(--app-radius-xl)] shadow-[var(--app-shadow-2)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(ev) => { setPaused(true); startX.current = ev.touches[0].clientX; }}
      onTouchEnd={(ev) => {
        if (startX.current === null) return;
        const dx = ev.changedTouches[0].clientX - startX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
        startX.current = null;
      }}
    >
      <div className="relative h-60 w-full sm:h-72">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={e.slug}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            <Link
              href={`/events/${e.slug}`}
              prefetch={false}
              className="group block h-full w-full"
              aria-label={`Featured event: ${e.title}`}
            >
              {/* On-brand backdrop — always present so a missing/broken
                  photo looks designed, never empty. */}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg, ${e.color} 0%, ${e.color}B0 45%, #15140f 100%)`,
                }}
                aria-hidden
              />
              {e.photo && !failed.has(e.slug) && (
                <Image
                  src={e.photo}
                  alt=""
                  fill
                  unoptimized={e.photo.startsWith("/api/place-photo")}
                  priority={i === 0}
                  sizes="(max-width: 720px) 100vw, 720px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  onError={() =>
                    setFailed((prev) => new Set(prev).add(e.slug))
                  }
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

              <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur"
                  style={{ background: `${e.color}D0` }}
                >
                  {e.eyebrow}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
                  <CalendarDays className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                  {e.categoryName}
                </span>
              </div>

              <div className="absolute inset-x-0 bottom-0 p-5 pb-9 text-white">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-80">
                  {e.when}
                </p>
                <h2 className="mt-0.5 flex items-start gap-2 font-serif text-[24px] font-semibold leading-tight tracking-tight sm:text-[26px]">
                  <span className="line-clamp-2">{e.title}</span>
                  <ArrowUpRight
                    className="mt-1 h-5 w-5 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </h2>
                <p className="mt-1 inline-flex items-center gap-1 text-[13px] opacity-85">
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  {e.venue}
                </p>
              </div>
            </Link>
          </motion.div>
        </AnimatePresence>

        {/* Dots — outside the Link so taps switch slides, not navigate */}
        {n > 1 && (
          <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-1.5">
            {events.map((ev, idx) => (
              <button
                key={ev.slug}
                type="button"
                aria-label={`Show ${ev.title}`}
                aria-current={idx === i}
                onClick={() => go(idx)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: idx === i ? 18 : 6,
                  background: idx === i ? "white" : "rgba(255,255,255,0.5)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
