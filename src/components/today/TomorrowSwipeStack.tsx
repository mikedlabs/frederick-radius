"use client";

import React, { useState } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronRight, Calendar } from "lucide-react";
import Link from "next/link";

type SwipeCardProps = {
  id: string;
  title: string;
  venue: string;
  slug: string;
  colorClass: string;
  textClass: string;
};

export default function TomorrowSwipeStack({ cards: initialCards, weatherLine }: { cards: SwipeCardProps[], weatherLine: string | null }) {
  const [cards, setCards] = useState(initialCards);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);

  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.x > 100 || info.offset.x < -100) {
      // Swipe left or right removes the top card
      setCards(cards.slice(1));
      x.set(0);
    }
  };

  if (cards.length === 0) {
    return (
      <div className="h-48 w-full border-2 border-dashed border-[var(--app-border)] rounded-[var(--app-radius-lg)] flex flex-col items-center justify-center text-[var(--app-ink-2)] font-medium p-4 text-center">
        <p>You are all caught up for tomorrow!</p>
        <Link href="/events" className="mt-2 text-[var(--app-brand)] underline">See the full calendar</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {weatherLine && (
        <p className="font-mono text-[11px] tabular-nums text-center text-[var(--app-ink-2)] bg-[var(--app-bg-elevated)] p-2 rounded-[var(--app-radius-md)] border border-[var(--app-border)] shadow-sm">
          {weatherLine}
        </p>
      )}
      <div className="relative h-56 w-full flex items-center justify-center perspective-[1000px]">
        <AnimatePresence>
          {cards.map((card, index) => {
            const isTop = index === 0;
            return (
              <motion.div
                key={card.id}
                style={{
                  x: isTop ? x : 0,
                  rotate: isTop ? rotate : 0,
                  zIndex: cards.length - index,
                }}
                drag={isTop ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={isTop ? handleDragEnd : undefined}
                initial={{ scale: 0.95, y: 10, opacity: 0 }}
                animate={{ 
                  scale: 1 - index * 0.05, 
                  y: index * 10,
                  opacity: 1 - index * 0.2
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={cn("absolute w-full h-48 rounded-[var(--app-radius-lg)] p-6 shadow-xl flex flex-col items-start justify-between cursor-grab active:cursor-grabbing", card.colorClass)}
              >
                <div>
                  <div className={cn("text-[10px] uppercase font-bold tracking-widest opacity-80", card.textClass)}>Tomorrow</div>
                  <h3 className={cn("text-xl font-bold mt-1 line-clamp-2", card.textClass)}>{card.title}</h3>
                </div>
                
                <div className="flex items-center justify-between w-full">
                  <div className={cn("text-sm opacity-90 truncate max-w-[80%]", card.textClass)}>
                    {card.venue}
                  </div>
                  <Link href={`/events/${card.slug}`} onPointerDown={(e) => e.stopPropagation()} className={cn("p-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm shadow-sm", card.textClass)}>
                    <ChevronRight size={18} />
                  </Link>
                </div>
                {isTop && (
                  <div className="absolute inset-0 pointer-events-none rounded-[var(--app-radius-lg)] border-2 border-white/10" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {/* Swipe instructions */}
        <motion.div 
          style={{ opacity: useTransform(x, [-50, 0, 50], [1, 0, 1]) }}
          className="absolute bottom-[-10px] left-4 right-4 flex justify-between pointer-events-none text-xs font-medium px-2 text-[var(--app-ink-3)]"
        >
          <span>← Skip</span>
          <span>Save →</span>
        </motion.div>
      </div>
    </div>
  );
}
