"use client";

import { Children } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

/**
 * Shelf — a titled horizontal rail. The structural answer to the
 * "infinite directory column": a category becomes a strong editorial
 * header + a swipeable row of tiles, the next tile peeking so it reads
 * as "there's more this way."
 *
 * Bolder pass (owner: "push further"): a larger serif header with a
 * brand tick, and the tiles stagger in as the shelf scrolls into view —
 * a deliberate, premium reveal rather than a static dump. Motion is
 * disabled under prefers-reduced-motion (content stays fully visible),
 * so it is expressive without being inaccessible.
 */

export default function Shelf({
  title,
  count,
  href,
  cta = "See all",
  children,
}: {
  title: string;
  count?: number;
  href?: string;
  cta?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const items = Children.toArray(children);

  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.055, delayChildren: 0.04 },
    },
  };
  const item = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 14, scale: 0.97 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring" as const, stiffness: 360, damping: 30 },
        },
      };

  return (
    <section className="space-y-3">
      <header className="flex items-end justify-between gap-3">
        <h2
          className="flex items-center gap-2 font-serif text-[22px] font-semibold leading-none tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          <span
            aria-hidden
            className="inline-block h-4 w-1 rounded-full"
            style={{ background: "var(--app-brand)" }}
          />
          {title}
          {count !== undefined && (
            <span
              className="text-base font-normal tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {count}
            </span>
          )}
        </h2>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 pb-0.5 text-xs font-semibold tracking-tight"
            style={{ color: "var(--app-brand)" }}
          >
            {cta}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        )}
      </header>
      {/* Negative margin + padding so the edge-fade mask and the first
          tile align to the page gutter, not the card's inner edge. */}
      <div className="-mx-4 px-4">
        <motion.div
          className="shelf-rail gap-3 pb-1"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
        >
          {items.map((child, i) => (
            <motion.div key={i} variants={item} className="shrink-0">
              {child}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
