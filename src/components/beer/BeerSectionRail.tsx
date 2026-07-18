"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

/**
 * BeerSectionRail — a sticky chapter rail for the beer guide.
 *
 * The page is a long editorial (tap wall, tonight radar, live taps,
 * taste flight, map, passport, catalog) and everything below the first
 * screen depended on scroll stamina. The rail keeps every chapter one
 * tap away and shows where you are, magazine-style: mono labels, one
 * hairline, the active chapter inked.
 *
 * Chapters whose section isn't on this render (live taps before any
 * brewery is configured) hide themselves after mount. Scrolling is
 * instant under reduced motion, smooth otherwise; active state comes
 * from an IntersectionObserver, so it tracks manual scrolling too.
 */
const CHAPTERS: Array<{ id: string; label: string }> = [
  { id: "taproom-wall", label: "Taprooms" },
  { id: "beer-week", label: "Tonight" },
  { id: "on-tap-now", label: "On tap" },
  { id: "find-your-pour", label: "Taste" },
  { id: "taproom-map", label: "Map" },
  { id: "my-taps", label: "My taps" },
  { id: "all-beer", label: "Catalog" },
];

export default function BeerSectionRail() {
  const [present, setPresent] = useState<string[]>(CHAPTERS.map((c) => c.id));
  const [active, setActive] = useState<string | null>(null);
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const found = CHAPTERS.filter((c) => document.getElementById(c.id)).map((c) => c.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time DOM probe after mount: which chapters exist on THIS render (live taps hides pre-pilot); no cascade, deps are empty
    setPresent(found);
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
          else visible.delete(entry.target.id);
        }
        // The active chapter is the FIRST (in page order) visible one —
        // reading order, not raw ratio, so long sections don't flicker.
        const current = found.find((id) => visible.has(id)) ?? null;
        if (current) setActive(current);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: [0, 0.05] },
    );
    for (const id of found) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  // Keep the active chip in view inside the rail's own scroll.
  useEffect(() => {
    if (!active || !railRef.current) return;
    const chip = railRef.current.querySelector<HTMLElement>(`[data-chapter="${active}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);

  function jump(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    haptic("light");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  return (
    <nav
      ref={railRef}
      aria-label="Beer guide chapters"
      className="sticky z-20 -mx-4 overflow-x-auto border-b px-4 backdrop-blur-sm [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      style={{
        top: "calc(var(--app-topbar-h) + env(safe-area-inset-top, 0px))",
        background: "color-mix(in srgb, var(--app-bg) 88%, transparent)",
        borderColor: "var(--app-border)",
      }}
    >
      <div className="flex w-max gap-1 py-1">
        {CHAPTERS.filter((c) => present.includes(c.id)).map((chapter) => {
          const isActive = active === chapter.id;
          return (
            <button
              key={chapter.id}
              type="button"
              data-chapter={chapter.id}
              onClick={() => jump(chapter.id)}
              aria-current={isActive ? "true" : undefined}
              className="tap-44-y shrink-0 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors"
              style={{
                color: isActive ? "var(--app-bg)" : "var(--app-ink-2)",
                background: isActive ? "var(--app-ink)" : "transparent",
              }}
            >
              {chapter.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
