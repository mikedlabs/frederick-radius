"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/haptics";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * PhotoLightbox — full-screen tap-to-enlarge photo viewer.
 *
 * Opens over everything (z above the sheet), shows one photo at a time
 * fit to the screen (object-contain, never cropped). Navigate by arrows,
 * keyboard (←/→), or horizontal swipe; dismiss by the X, Esc, a tap on
 * the backdrop, or a swipe-down. Body scroll is locked while open.
 *
 * Reusable: any surface with a photo (place sheet hero + gallery today;
 * result cards later) can hand it an ordered `photos` array + a start
 * index. It self-hides when handed an empty set.
 */
export default function PhotoLightbox({
  photos,
  startIndex = 0,
  alt = "Photo",
  onClose,
}: {
  photos: string[];
  startIndex?: number;
  alt?: string;
  onClose: () => void;
}) {
  const count = photos.length;
  const reduceMotion = useReducedMotion();
  const [i, setI] = useState(startIndex);
  const go = useCallback(
    (d: number) => { setI((p) => (p + d + count) % count); haptic("light"); },
    [count],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  // Focus management (2026-07 shell-hardening P7): move focus INTO the viewer
  // on open — before, focus stayed on the page behind it and Tab walked through
  // the obscured DOM — and restore it to the opener on close. Mount-only so a
  // parent re-render (changing onClose identity) can't restore early.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus?.();
  }, []);
  // Keep Tab within the viewer while it's up.
  useFocusTrap(dialogRef, true);

  // Portal to <body> so the overlay escapes the draggable sheet's
  // transform (a transformed ancestor would otherwise re-anchor `fixed`).
  if (count === 0 || typeof document === "undefined") return null;
  const chrome = {
    background: "rgba(255,255,255,0.13)",
    color: "white",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  } as const;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        className="fixed inset-0 z-[var(--z-lightbox)] flex items-center justify-center outline-none"
        style={{ background: "rgba(8,6,4,0.93)" }}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Photo viewer"
      >
        {/* The image. A tap (no movement) bubbles to the backdrop → close;
            a drag navigates (horizontal) or dismisses (downward). */}
        <motion.div
          key={i}
          className="absolute inset-0"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          drag={reduceMotion ? false : true}
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (count > 1 && Math.abs(info.offset.x) > Math.abs(info.offset.y) && Math.abs(info.offset.x) > 80) {
              go(info.offset.x < 0 ? 1 : -1);
            } else if (info.offset.y > 120) {
              onClose();
            }
          }}
        >
          <Image
            src={photos[i]}
            alt={alt}
            fill
            unoptimized={photos[i].startsWith("/api/place-photo")}
            sizes="100vw"
            className="object-contain"
            priority
          />
        </motion.div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Close photo"
          className="absolute top-[max(env(safe-area-inset-top,0px)+12px,12px)] z-10 inline-flex h-11 w-11 items-center justify-center rounded-full active:scale-95"
          style={{ ...chrome, right: "max(12px, env(safe-area-inset-right, 0px))" }}
        >
          <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label="Previous photo"
              className="absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full active:scale-95"
              style={{ ...chrome, left: "max(8px, env(safe-area-inset-left, 0px))" }}
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label="Next photo"
              className="absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full active:scale-95"
              style={{ ...chrome, right: "max(8px, env(safe-area-inset-right, 0px))" }}
            >
              <ChevronRight className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            </button>
            <div
              className="absolute bottom-[max(env(safe-area-inset-bottom,0px)+16px,16px)] left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-[12px] font-semibold tabular-nums"
              style={chrome}
            >
              {i + 1} / {count}
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
