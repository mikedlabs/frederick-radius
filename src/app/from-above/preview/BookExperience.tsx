"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";

/**
 * BookExperience — the /from-above coffee-table-book preview, now
 * backed by StPageFlip (via react-pageflip) instead of a hand-rolled
 * framer-motion drag deck.
 *
 * Why we switched
 *   The custom deck shipped earlier read as a photo carousel, not a
 *   book. Users expect magazine page-flow: a page lifts off the
 *   spine, curls, settles. That's a hard problem (3D mesh, hinge
 *   physics, drag tracking, mobile + desktop, two-page spread vs
 *   single-page) and reinventing it is a multi-day spelunking trip.
 *   StPageFlip is the engine real digital-magazine sites use; the
 *   React wrapper (HTMLFlipBook) takes children and handles the rest.
 *
 * Layout strategy
 *   - State machine still gates the cover-open intro: tap cover →
 *     cover rotates → HTMLFlipBook mounts at page 1 → swipe / drag
 *     to flip through. End card (CTA to miked.store) lives in the
 *     same JSX tree after the photo pages.
 *   - On mobile (<640px) HTMLFlipBook runs in single-page portrait
 *     mode (usePortrait=true). On wider viewports it shows the two-
 *     page spread, like an opened book held with both hands.
 *   - Page size is computed from the manifest's first photo so the
 *     ratio matches the source, avoiding letterbox or crop.
 *
 * Dynamic import: react-pageflip ships with vanilla JS that touches
 * window/document at import time. Loading it via next/dynamic with
 * ssr:false keeps Next happy and the bundle out of the SSR pass.
 */

// The react-pageflip default export is `HTMLFlipBook`. ssr:false because
// the underlying StPageFlip is window-bound.
const HTMLFlipBook = dynamic(() => import("react-pageflip"), { ssr: false });

type Photo = {
  id: string;
  src: string;
  srcSet: string;
  width: number;
  height: number;
  orient: "landscape" | "portrait";
};

type Props = { cover: string; photos: Photo[] };

type Phase = "closed" | "opening" | "open";

// Light seasonal tagging based on book order — colors the corner chip
// inside the book pages. Real version reads from the manifest; the
// prototype just divides the run into quarters.
function chapterFor(idx: number, total: number): { label: string; tone: string } {
  const q = idx / Math.max(1, total - 1);
  if (q < 0.25) return { label: "Winter", tone: "#9bb4cf" };
  if (q < 0.5)  return { label: "Spring", tone: "#a8c79a" };
  if (q < 0.75) return { label: "Summer", tone: "#e0b878" };
  return { label: "Autumn", tone: "#c98558" };
}

export default function BookExperience({ cover, photos }: Props) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [pageIdx, setPageIdx] = useState(0);
  const reducedMotion = useReducedMotion();
  const flipRef = useRef<{
    pageFlip?: () => {
      flipNext: () => void;
      flipPrev: () => void;
      flip: (i: number) => void;
    };
  } | null>(null);

  const total = photos.length;

  // Fixed page ratio that matches the print book's 3:4-ish trim
  // (cover-front.webp is 1200×1496 ≈ 0.80). Earlier the ratio was
  // derived from photos[0], but the manifest now mixes landscape
  // and portrait drone shots — picking up a landscape as the first
  // page would have squashed every page in the book to a wide-short
  // strip. Each photo handles its own orientation inside the fixed
  // page via object-fit:contain.
  const baseRatio = 0.78;

  const openBook = useCallback(() => {
    if (reducedMotion) {
      setPhase("open");
      return;
    }
    setPhase("opening");
    window.setTimeout(() => setPhase("open"), 950);
  }, [reducedMotion]);

  const closeBook = useCallback(() => {
    setPhase("closed");
    setPageIdx(0);
  }, []);

  // Re-mount HTMLFlipBook when phase flips to "open" so its internal
  // measurement runs against the now-visible container. Without this,
  // the book renders at 0×0 because the parent was display:none-ish
  // (opacity 0) during the cover-open transition.
  const [mountKey, setMountKey] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: re-key HTMLFlipBook on phase change so its internal width measurement runs against the now-visible container
    if (phase === "open") setMountKey((k) => k + 1);
  }, [phase]);

  const chapter = chapterFor(pageIdx, total);

  return (
    <main
      className="relative isolate min-h-[100dvh] w-full overflow-hidden bg-black text-white"
      style={{ perspective: "1800px", perspectiveOrigin: "50% 50%" }}
    >
      {/* Soft background hue — same time-of-day-ish wash from the
          previous build, kept so the dark stage doesn't feel sterile
          when the book is mid-flight. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(160,90,40,0.18), transparent 60%), radial-gradient(120% 90% at 50% 100%, rgba(50,80,140,0.18), transparent 60%)",
        }}
      />

      {phase === "closed" || phase === "opening" ? (
        <CoverStage
          cover={cover}
          opening={phase === "opening"}
          onOpen={openBook}
        />
      ) : (
        <FlipStage
          key={mountKey}
          ref={flipRef}
          cover={cover}
          photos={photos}
          baseRatio={baseRatio}
          onPageFlip={(i) => setPageIdx(i)}
          onClose={closeBook}
          pageIdx={pageIdx}
          total={total}
          chapter={chapter}
        />
      )}
    </main>
  );
}

/* ----------------------------- cover stage ---------------------------- */

function CoverStage({
  cover, opening, onOpen,
}: {
  cover: string;
  opening: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      aria-label="Front cover"
      className="absolute inset-0 grid place-items-center"
      style={{ perspective: "1800px" }}
    >
      {/* The cover rotates around its left edge, like a hardcover
          opening. Once it crosses -90° the back face of the cover
          (uniform paper-cream) is visible, then it disappears off
          the left and the FlipStage takes over. */}
      <motion.button
        type="button"
        onClick={onOpen}
        aria-label="Open the book"
        initial={{ rotateY: -8 }}
        animate={{ rotateY: opening ? -158 : -8 }}
        transition={{ duration: 1.15, ease: [0.65, 0, 0.2, 1] }}
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: "left center",
          width: "min(85vw, 380px)",
          aspectRatio: "1800 / 2310",
          boxShadow: "0 32px 80px -16px rgba(0,0,0,0.7), 0 8px 24px -8px rgba(0,0,0,0.5)",
          borderRadius: 2,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
        }}
      >
        <Image
          src={cover}
          alt=""
          fill
          sizes="(max-width: 640px) 85vw, 380px"
          style={{ objectFit: "cover" }}
          priority
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
        <span
          className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-medium tracking-wide backdrop-blur"
          style={{ opacity: opening ? 0 : 1, transition: "opacity 200ms" }}
        >
          Tap to open
        </span>
      </motion.button>
    </div>
  );
}

/* ----------------------------- flip stage ----------------------------- */

type FlipStageProps = {
  cover: string;
  photos: Photo[];
  baseRatio: number;
  onPageFlip: (i: number) => void;
  onClose: () => void;
  pageIdx: number;
  total: number;
  chapter: { label: string; tone: string };
};

type FlipBookHandle = {
  pageFlip?: () => {
    flipNext: () => void;
    flipPrev: () => void;
    flip: (i: number) => void;
  };
};

const FlipStage = forwardRef<FlipBookHandle, FlipStageProps>(function FlipStage(
  { cover, photos, baseRatio, onPageFlip, onClose, pageIdx, total, chapter },
  ref,
) {
  // Responsive sizing — measure the container so HTMLFlipBook
  // doesn't render at 0×0 on first mount and so portrait phones get
  // a tall page while landscape/tablets get the spread.
  const [size, setSize] = useState<{ w: number; h: number; portrait: boolean }>({
    w: 360,
    h: 520,
    portrait: true,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Reserve a slim 64px for top/bottom chrome (chapter chip,
      // close button, page counter). Earlier this was 140px which
      // capped the book to ~60% of viewport height even on a tall
      // phone; the chrome itself only needs ~48px and the rest was
      // just dead air.
      const maxH = rect.height - 64;
      // Spread breakpoint: anywhere two pages can sit side-by-side
      // with reasonable breathing room. Below 900px it's a single
      // portrait page.
      const portrait = rect.width < 900;
      let pageW: number;
      if (portrait) {
        // Single page fills the viewport up to a tasteful cap.
        pageW = Math.min(rect.width - 24, 560);
      } else {
        // Two-page spread. The book gets the full inner width minus
        // some side padding, then split evenly between the pages.
        const inner = Math.min(rect.width - 80, 1400);
        pageW = inner / 2;
      }
      const pageH = Math.min(pageW / baseRatio, maxH);
      // If height was the constraint, recompute width to keep ratio.
      const finalW = pageH * baseRatio;
      setSize({ w: Math.floor(finalW), h: Math.floor(pageH), portrait });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [baseRatio]);

  return (
    <div ref={containerRef} className="absolute inset-0 grid place-items-center px-4">
      {/* The flip book itself. StPageFlip wants children that are
          discrete pages; each <PageFrame> below holds one photo plus
          some chrome (paper texture, page number). We append an end
          card after the photos so flipping past the last photo lands
          on the buy-the-hardcover CTA. The IFlipSetting interface
          lists every prop as required, so we pass sensible defaults
          for everything even when we don't care (autoSize, etc.). */}
      <HTMLFlipBook
        ref={ref}
        width={size.w}
        height={size.h}
        size="stretch"
        minWidth={280}
        maxWidth={800}
        minHeight={380}
        maxHeight={1100}
        showCover={false}
        maxShadowOpacity={0.5}
        drawShadow
        flippingTime={650}
        usePortrait={size.portrait}
        mobileScrollSupport={false}
        clickEventForward={false}
        useMouseEvents
        startPage={0}
        startZIndex={0}
        autoSize={true}
        swipeDistance={30}
        showPageCorners
        disableFlipByClick={false}
        onFlip={(e: { data: number }) => onPageFlip(e.data)}
        className="from-above-flipbook"
        style={{ background: "transparent" }}
      >
        {photos.map((p, i) => (
          <PageFrame key={p.id} index={i} total={total} photo={p} />
        ))}
        <EndPage cover={cover} onClose={onClose} />
      </HTMLFlipBook>

      {/* Chapter chip — top left of the stage, OUTSIDE the flipbook
          so it doesn't get caught in the page-flip transform. */}
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

      {/* Top-right close button — returns to cover-closed state. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the book"
        className="absolute right-[max(env(safe-area-inset-right),16px)] top-[max(env(safe-area-inset-top),16px)] inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-medium tracking-wide text-white/80 backdrop-blur-md transition hover:bg-white/15"
      >
        Close
      </button>

      {/* Page counter — bottom center, hairline. Counts photo pages
          only; the end card is "Last page". */}
      <div className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),20px)] left-0 right-0 grid place-items-center">
        <div className="font-mono text-[10px] tracking-[0.18em] text-white/55">
          {pageIdx >= total
            ? "LAST PAGE"
            : `${String(pageIdx + 1).padStart(2, "0")} ${"/"} ${String(total).padStart(2, "0")}`}
        </div>
      </div>
    </div>
  );
});

/* ----------------------------- a page --------------------------------- */

/**
 * PageFrame — a single photo page inside HTMLFlipBook. react-pageflip
 * REQUIRES each page to be a React element (not an array, not a
 * fragment) at the top level, with width/height taken from the
 * parent's settings. Inside that frame we render the photo with
 * object-fit:contain on a paper-cream backing so a portrait photo
 * doesn't squash to fit a slightly different page ratio.
 */
const PageFrame = forwardRef<
  HTMLDivElement,
  { index: number; total: number; photo: Photo }
>(function PageFrame({ index, total, photo }, ref) {
  return (
    <div
      ref={ref}
      className="relative h-full w-full overflow-hidden"
      style={{
        background: "#0e0e0e",
        // Subtle inner shadow that hints at the page hinge along
        // both edges — gives the paper some weight against the
        // stage. The StPageFlip engine adds its own dynamic shadow
        // during the flip, so we keep this static one quiet.
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      <Image
        src={photo.src}
        alt={`Page ${index + 1} of ${total}`}
        fill
        sizes="(max-width: 640px) 90vw, 600px"
        style={{ objectFit: "contain", objectPosition: "center" }}
        priority={index < 2}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
});

const EndPage = forwardRef<HTMLDivElement, { cover: string; onClose: () => void }>(
  function EndPage({ cover, onClose }, ref) {
    return (
      <div ref={ref} className="grid h-full w-full place-items-center bg-[#0e0e0e] px-6">
        <div className="w-full max-w-[360px] text-center">
          <div
            className="mx-auto mb-4 overflow-hidden rounded-[2px]"
            style={{
              aspectRatio: "1800 / 2310",
              width: 120,
              boxShadow: "0 12px 24px -8px rgba(0,0,0,0.8)",
            }}
          >
            <Image
              src={cover}
              alt=""
              width={120}
              height={154}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          </div>
          <div className="font-serif text-[18px] leading-tight">Want it on your coffee table?</div>
          <div className="mt-1 text-[12px] leading-relaxed text-white/65">
            The hardcover. 152 photos. Six years of mornings and storms.
          </div>
          <a
            href="https://www.miked.store"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 grid w-full place-items-center rounded-full bg-white px-4 py-3 text-[14px] font-semibold tracking-tight text-black transition hover:bg-white/90"
          >
            Get the hardcover at miked.store
          </a>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 text-[12px] text-white/55 underline-offset-4 hover:underline"
          >
            Close the book
          </button>
        </div>
      </div>
    );
  },
);
