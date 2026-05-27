"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import Image from "next/image";

// The whole prototype lives in one client component on purpose:
// a single state machine drives the cover-open → swipe deck → end-card
// sequence and a single perspective context wraps all three so the
// 3D book metaphor holds together. Splitting into sub-components added
// no leverage for ~250 lines and forced unnecessary prop drilling.
//
// State machine: "closed" (cover visible, tap to open) → "opening"
// (cover rotates away over ~1.2s, first photo crossfades in) → "deck"
// (horizontal swipe through photos) → "end" (hardcover CTA card).

type Photo = {
  id: string;
  src: string;
  srcSet: string;
  width: number;
  height: number;
  orient: "landscape" | "portrait";
};

type Props = { cover: string; photos: Photo[] };

type Phase = "closed" | "opening" | "deck" | "end";

// Light seasonal tagging based on book order. Real version reads from
// the manifest; for the prototype this just colors the chapter chips.
function chapterFor(idx: number, total: number): { label: string; tone: string } {
  const q = idx / Math.max(1, total - 1);
  if (q < 0.25) return { label: "Winter", tone: "#9bb4cf" };
  if (q < 0.5)  return { label: "Spring", tone: "#a8c79a" };
  if (q < 0.75) return { label: "Summer", tone: "#e0b878" };
  return { label: "Autumn", tone: "#c98558" };
}

export default function BookExperience({ cover, photos }: Props) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [idx, setIdx] = useState(0);
  const reducedMotion = useReducedMotion();

  const total = photos.length;
  const photo = photos[idx];
  const chapter = useMemo(() => chapterFor(idx, total), [idx, total]);

  // Open: tap on the cover. Reduced motion skips the rotation.
  const openBook = useCallback(() => {
    if (phase !== "closed") return;
    if (reducedMotion) {
      setPhase("deck");
      return;
    }
    setPhase("opening");
    // The cover animation runs ~1.2s; advance to deck just after.
    const t = window.setTimeout(() => setPhase("deck"), 1250);
    return () => window.clearTimeout(t);
  }, [phase, reducedMotion]);

  const next = useCallback(() => {
    if (phase !== "deck") return;
    if (idx === total - 1) {
      setPhase("end");
      return;
    }
    setIdx((i) => Math.min(total - 1, i + 1));
  }, [idx, total, phase]);

  const prev = useCallback(() => {
    if (phase === "end") {
      setPhase("deck");
      return;
    }
    if (phase !== "deck") return;
    setIdx((i) => Math.max(0, i - 1));
  }, [phase]);

  // Keyboard: arrows + space advance, esc closes the book back to cover
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Enter" && phase === "closed") { e.preventDefault(); openBook(); }
      else if (e.key === "Escape") { setPhase("closed"); setIdx(0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, openBook, phase]);

  return (
    <main
      className="relative h-[100svh] w-screen overflow-hidden bg-black text-white"
      style={{ perspective: "1800px", perspectiveOrigin: "50% 50%" }}
    >
      {/* Layer 0: ambient gradient under everything — a faint warm
          glow toward the bottom that reads as "lamp light on the table"
          when the book is closed. Goes invisible during the deck so
          photos own the canvas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          background:
            "radial-gradient(ellipse at 50% 88%, rgba(196,69,28,0.18), transparent 55%)",
          opacity: phase === "closed" || phase === "opening" ? 1 : 0,
        }}
      />

      {/* The "book" itself. In closed/opening phases the cover sits
          above the first photo with a 3D perspective rotation. Once
          we hit "deck" we tear this down and the swipe deck takes
          over the full viewport. */}
      {(phase === "closed" || phase === "opening") && (
        <CoverStage
          cover={cover}
          first={photos[0]}
          phase={phase}
          onOpen={openBook}
        />
      )}

      {phase === "deck" && photo && (
        <SwipeDeck
          photo={photo}
          idx={idx}
          total={total}
          chapter={chapter}
          onNext={next}
          onPrev={prev}
        />
      )}

      {phase === "end" && (
        <EndCard cover={cover} onBack={prev} onRestart={() => { setIdx(0); setPhase("closed"); }} />
      )}
    </main>
  );
}

/* --------------------------- cover stage --------------------------- */

function CoverStage({
  cover, first, phase, onOpen,
}: {
  cover: string;
  first: Photo | undefined;
  phase: Phase;
  onOpen: () => void;
}) {
  const opening = phase === "opening";
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div
        className="relative"
        style={{
          width: "min(72vw, 360px)",
          aspectRatio: "1800 / 2310",
          transformStyle: "preserve-3d",
        }}
      >
        {/* First inside photo — sits at the back, revealed when the
            cover swings open. Slightly inset so the cover's "edge"
            still implies the book around it. */}
        {first && (
          <div
            className="absolute inset-0 overflow-hidden rounded-[2px]"
            style={{
              transform: "translateZ(-2px)",
              boxShadow: "0 30px 60px -20px rgba(0,0,0,0.65)",
            }}
          >
            <Image
              src={first.src}
              alt=""
              fill
              sizes="(max-width: 480px) 72vw, 360px"
              style={{ objectFit: "cover" }}
              priority
            />
            {/* warm vignette to suggest depth of the open page */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 18%)",
              }}
            />
          </div>
        )}

        {/* The cover itself — rotates around its left edge. Initial
            state has a tiny rotation so the book reads as 3D even at
            rest. Tap fires the open animation. */}
        <motion.button
          type="button"
          onClick={onOpen}
          aria-label="Open the book"
          initial={{ rotateY: -8 }}
          animate={{ rotateY: opening ? -158 : -8 }}
          transition={{ duration: 1.15, ease: [0.65, 0, 0.2, 1] }}
          className="absolute inset-0 cursor-pointer rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{
            transformOrigin: "left center",
            transformStyle: "preserve-3d",
            boxShadow:
              "0 26px 50px -16px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04) inset",
            background: "#0a0a0a",
          }}
        >
          <Image
            src={cover}
            alt="Downtown Frederick — the book cover"
            fill
            sizes="(max-width: 480px) 72vw, 360px"
            style={{ objectFit: "cover" }}
            priority
          />
          {/* Subtle gutter shadow on the spine side, sells the depth */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0) 100%)",
            }}
          />
        </motion.button>
      </div>

      {/* CTA below the book — auto-hides during the opening animation
          so it doesn't compete with the page-turn. Uses the existing
          `.fade-up` @starting-style pattern from globals.css; framer-
          motion's mount-animation was racing with React 19's strict
          mount and leaving these elements stuck at opacity:0. */}
      <button
        type="button"
        onClick={onOpen}
        className="fade-up absolute bottom-[max(env(safe-area-inset-bottom),20px)] left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 text-[13px] font-medium tracking-wide backdrop-blur-sm transition hover:bg-white/[0.1]"
        style={{
          opacity: opening ? 0 : undefined,
          transitionDelay: "150ms",
        }}
      >
        Open the book
      </button>

      {/* Title overhead — quiet, doesn't fight the photography */}
      <div
        className="fade-up absolute top-[max(env(safe-area-inset-top),24px)] left-0 right-0 grid place-items-center"
        style={{ opacity: opening ? 0 : undefined }}
      >
        <div className="font-serif text-[11px] uppercase tracking-[0.32em] text-white/55">
          From above · Frederick
        </div>
      </div>
    </div>
  );
}

/* --------------------------- swipe deck --------------------------- */

function SwipeDeck({
  photo, idx, total, chapter, onNext, onPrev,
}: {
  photo: Photo;
  idx: number;
  total: number;
  chapter: { label: string; tone: string };
  onNext: () => void;
  onPrev: () => void;
}) {
  // direction is state (not a ref) so AnimatePresence's custom prop
  // actually re-evaluates on each transition. Refs don't trigger a
  // re-render and the framer-motion entry/exit variants would freeze
  // on whatever the ref's first value was.
  const [direction, setDirection] = useState<1 | -1>(1);

  /* MAGAZINE PAGE FLOW
   *
   * Earlier pass shipped a simple x±60 + opacity slide. It read as a
   * deck of photos, not a book — the user landed and didn't feel like
   * they were turning pages. This rewrite drives the page off a live
   * useMotionValue tied directly to the drag, so the photo moves with
   * the finger frame-by-frame. While dragging:
   *
   *   - x          — translates with the drag offset
   *   - rotateY    — derived from x; the page lifts at a slight angle
   *                  like a real spread being opened (anchored at the
   *                  spine via transform-origin)
   *   - boxShadow  — opacity ramps with rotation so the deeper the
   *                  flip, the heavier the cast shadow on the back
   *
   * On release: if the threshold is hit, we let the page continue
   * flying off via the AnimatePresence exit variant (no snap-back
   * frame); otherwise the spring eases it back to 0. The motion value
   * resets to 0 on photo change so the new page starts at rest.
   *
   * This is intentionally NOT a 3D-curl with separate front/back
   * faces — that pattern needs duplicate DOM per page and breaks
   * Image priority/lazy-load. A subtle perspective tilt sells the
   * "magazine spread" feeling for 1/10th the complexity.
   */
  const x = useMotionValue(0);
  // Hinge the rotation at the opposite edge of the drag direction so
  // dragging left pivots from the left spine, dragging right from the
  // right. The transform-origin flips with sign so the page reads as
  // turning around the correct hinge.
  const rotateY = useTransform(x, [-400, 0, 400], [-22, 0, 22]);
  // Soft cast shadow under the lifting page — grows with rotation.
  const shadow = useTransform(
    x,
    [-300, 0, 300],
    [
      "0 24px 60px -20px rgba(0,0,0,0.85), 0 8px 20px -8px rgba(0,0,0,0.55)",
      "0 0 0 rgba(0,0,0,0)",
      "0 24px 60px -20px rgba(0,0,0,0.85), 0 8px 20px -8px rgba(0,0,0,0.55)",
    ],
  );
  // Slight darken on the trailing edge — sells the page-curl illusion
  // without needing a real curl mesh.
  const trailingDim = useTransform(x, [-300, 0, 300], [0.22, 0, 0.22]);

  // Reset the motion value whenever the photo changes, so the next
  // page mounts at x=0 instead of inheriting the previous drag offset.
  useEffect(() => {
    x.set(0);
  }, [photo.id, x]);

  const slideVariants = {
    enter: (d: 1 | -1) => ({ x: d * 320, rotateY: -d * 16, opacity: 0 }),
    center: { x: 0, rotateY: 0, opacity: 1 },
    exit:  (d: 1 | -1) => ({ x: -d * 320, rotateY: d * 16, opacity: 0 }),
  };

  return (
    <div
      className="absolute inset-0"
      style={{ perspective: "1800px", perspectiveOrigin: "50% 50%" }}
    >
      {/* Full-bleed photo, page-flip-animated.
          AnimatePresence with mode="popLayout" so the outgoing and
          incoming photos overlap during the transition, like turning
          a magazine spread. */}
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div
          key={photo.id}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            // Spring physics on the enter/exit — feels like a hand-
            // turned page that settles with a little weight. Tuned to
            // be quick enough that a fast swiper isn't waiting, slow
            // enough that the motion reads.
            type: "spring",
            stiffness: 220,
            damping: 30,
            mass: 0.9,
          }}
          drag="x"
          dragElastic={0.1}
          dragMomentum={false}
          style={{
            x,
            rotateY,
            boxShadow: shadow,
            transformStyle: "preserve-3d",
          }}
          onDragEnd={(_, info) => {
            // Threshold tuned for mobile: a comfortable thumb flick
            // (offset>110 OR velocity>420) commits the turn; anything
            // less springs back to center via the value's natural
            // damping (no explicit code needed — releasing the drag
            // hands the motion value back to the variants).
            if (info.offset.x < -110 || info.velocity.x < -420) {
              setDirection(1);
              onNext();
            } else if (info.offset.x > 110 || info.velocity.x > 420) {
              setDirection(-1);
              onPrev();
            }
          }}
          className="absolute inset-0 grid place-items-center will-change-transform"
        >
          {/* object-fit: contain — preserves the portrait aspect of
              the source photos. cover would crop top/bottom to fill
              the viewport on landscape/desktop, making vertical
              photographs read as landscape strips. contain letterboxes
              the photo against the black canvas, which keeps the
              "book held in front of you" metaphor on every viewport.
              The photos directory is intentionally portrait-only
              (build script filters at source) so this never produces
              awkward sideways letterboxing. */}
          <div className="relative h-full w-full">
            <Image
              src={photo.src}
              alt={`${chapter.label} · Downtown Frederick from above`}
              fill
              sizes="100vw"
              style={{ objectFit: "contain", objectPosition: "center" }}
              priority
              draggable={false}
              // onContextMenu prevention is a low-friction deterrent
              // against casual right-click → save. Determined users
              // can still grab the file from devtools; the goal is to
              // discourage screenshot-and-share over the bookstore.
              onContextMenu={(e) => e.preventDefault()}
            />
            {/* Trailing-edge dim — a soft black overlay whose opacity
                grows with rotation, faked the curl shadow without
                needing a 3D mesh. Pointer-events-none so it doesn't
                eat drag input. */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: "black", opacity: trailingDim }}
            />
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Chapter chip — top left. Keyed on label so it re-mounts only
          when the chapter changes, animating in fresh; plain CSS
          (fade-up) avoids the framer-motion mount race we hit on the
          cover stage. */}
      <div
        key={`chap-${chapter.label}`}
        className="fade-up pointer-events-none absolute left-[max(env(safe-area-inset-left),16px)] top-[max(env(safe-area-inset-top),16px)] flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] backdrop-blur-md"
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: chapter.tone }}
        />
        {chapter.label}
      </div>

      {/* Page counter — bottom center, hairline */}
      <div className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),20px)] left-0 right-0 grid place-items-center">
        <div className="font-mono text-[10px] tracking-[0.18em] text-white/55">
          {String(idx + 1).padStart(2, "0")} <span className="opacity-50">/</span> {String(total).padStart(2, "0")}
        </div>
      </div>

      {/* Click zones for desktop — left third = prev, right two-thirds
          = next. On mobile the drag gesture handles this; the zones
          are kept invisible and below the photo so they don't steal
          accessible focus. */}
      <div className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize" onClick={() => { setDirection(-1); onPrev(); }} aria-hidden />
      <div className="absolute inset-y-0 left-1/3 right-0 cursor-e-resize" onClick={() => { setDirection(1); onNext(); }} aria-hidden />
    </div>
  );
}

/* --------------------------- end card --------------------------- */

function EndCard({
  cover, onBack, onRestart,
}: {
  cover: string;
  onBack: () => void;
  onRestart: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 grid place-items-center px-6"
    >
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
        <div className="grid grid-cols-[88px_1fr] items-center gap-4">
          <div
            className="relative overflow-hidden rounded-[2px]"
            style={{ aspectRatio: "1800 / 2310", boxShadow: "0 12px 24px -8px rgba(0,0,0,0.8)" }}
          >
            <Image src={cover} alt="" fill sizes="88px" style={{ objectFit: "cover" }} />
          </div>
          <div>
            <div className="font-serif text-[18px] leading-tight">Want it on your coffee table?</div>
            <div className="mt-1 text-[12px] leading-relaxed text-white/65">
              The hardcover. 152 photos. Six years of mornings and storms.
            </div>
          </div>
        </div>

        <a
          href="https://miked.store"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 grid w-full place-items-center rounded-full bg-white px-4 py-3 text-[14px] font-semibold tracking-tight text-black transition hover:bg-white/90"
        >
          Get the hardcover at miked.store
        </a>

        <div className="mt-3 flex justify-between text-[12px] text-white/55">
          <button type="button" onClick={onBack} className="underline-offset-4 hover:underline">
            Back to the photos
          </button>
          <button type="button" onClick={onRestart} className="underline-offset-4 hover:underline">
            Close the book
          </button>
        </div>
      </div>
    </motion.div>
  );
}
