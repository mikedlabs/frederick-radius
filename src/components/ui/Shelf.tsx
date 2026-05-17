"use client";

import { Children } from "react";
import { motion, useReducedMotion } from "framer-motion";
import SectionHeading from "./SectionHeading";

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
      <SectionHeading title={title} count={count} href={href} cta={cta} />
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
