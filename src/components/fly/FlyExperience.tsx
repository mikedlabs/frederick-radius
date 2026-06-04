"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, X, ArrowUpRight } from "lucide-react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * FlyExperience — the "descend into Frederick" prototype.
 *
 *   sky   → tap Descend → the high aerial scales up + fades while the
 *           downtown aerial settles in (camera landing), then the real
 *           places bloom in as pins.
 *   pin   → tap → the pin's thumbnail MORPHS (shared-element layoutId)
 *           into the full place card.
 *
 * Pure framer-motion; no map engine. The whole point is to feel whether
 * "flying Frederick" should be the identity.
 */

export type FlyPlace = {
  slug: string;
  name: string;
  category: string;
  photo: string;
  color: string;
  open: boolean;
};

// Representative pin positions over the downtown aerial. A real
// lat/lng→pixel projection needs the shot's camera footprint, which the
// archive doesn't carry — so for the prototype these are hand-placed to
// scatter naturally across the frame.
const PIN_POS = [
  { top: "43%", left: "26%" },
  { top: "55%", left: "47%" },
  { top: "47%", left: "71%" },
  { top: "67%", left: "33%" },
  { top: "64%", left: "63%" },
  { top: "74%", left: "50%" },
];

type Season = "spring" | "summer" | "fall" | "winter";
type SeasonShot = { key: Season; src: string; altM: number };
const SEASON_LABEL: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
};

export default function FlyExperience({
  highSrc,
  places,
  seasons,
  initialSeason,
  initialStage = "sky",
  initialOpenSlug = null,
}: {
  highSrc: string;
  places: FlyPlace[];
  seasons: SeasonShot[];
  initialSeason: Season;
  initialStage?: "sky" | "ground";
  initialOpenSlug?: string | null;
}) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<"sky" | "ground">(initialStage);
  const [activeSeason, setActiveSeason] = useState<Season>(initialSeason);
  const [selected, setSelected] = useState<FlyPlace | null>(
    () => (initialOpenSlug ? places.find((p) => p.slug === initialOpenSlug) ?? null : null),
  );
  // Pins stagger-bloom only AFTER an actual descent. A direct deep-link
  // into the ground stage shows them already settled.
  const [bloom, setBloom] = useState(initialStage !== "ground");

  // The active season's altitude — for the caption. The images themselves
  // are stacked layers (below), cross-faded by opacity.
  const activeAlt = (seasons.find((s) => s.key === activeSeason) ?? seasons[0])?.altM ?? 0;

  const descend = () => {
    setSelected(null);
    setBloom(true);
    setStage("ground");
  };
  const ascend = () => {
    setSelected(null);
    setStage("sky");
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      {/* ── SKY: the county from above ─────────────────────────────── */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={stage === "sky" ? { scale: 1, opacity: 1 } : { scale: 1.7, opacity: 0 }}
        transition={{ duration: reduce ? 0.35 : 1.1, ease: [0.22, 1, 0.36, 1] }}
        style={{ pointerEvents: stage === "sky" ? "auto" : "none" }}
      >
        <motion.div
          className="absolute inset-0"
          animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
          transition={reduce ? undefined : { duration: 26, repeat: Infinity, ease: "easeInOut" }}
        >
          <Image
            src={highSrc}
            alt="Frederick County from above"
            fill
            priority
            sizes="100vw"
            placeholder="blur"
            blurDataURL={PAPER_CREAM_BLUR}
            className="object-cover"
          />
        </motion.div>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 28%, rgba(0,0,0,0.12) 58%, rgba(0,0,0,0.82) 100%)",
          }}
        />
        <div className="absolute inset-x-0 top-0 p-6 pt-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
            Frederick Radius · prototype
          </p>
          <h1 className="mt-2 font-serif text-[34px] font-semibold leading-[1.05]">
            Frederick County,
            <br />
            from above.
          </h1>
          <p className="mt-2.5 max-w-[26ch] text-[14px] leading-snug text-white/80">
            Tap to descend into downtown — the way it was shot.
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-8 pb-14">
          <motion.button
            type="button"
            onClick={descend}
            className="inline-flex items-center gap-2 rounded-full bg-white/15 px-6 py-3.5 text-[15px] font-semibold backdrop-blur"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.28)" }}
            whileTap={{ scale: 0.96 }}
            animate={reduce ? undefined : { y: [0, 7, 0] }}
            transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            Descend <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </motion.button>
        </div>
      </motion.div>

      {/* ── GROUND: downtown, settled ──────────────────────────────── */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={stage === "ground" ? { scale: 1, opacity: 1 } : { scale: 1.45, opacity: 0 }}
        transition={{ duration: reduce ? 0.35 : 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ pointerEvents: stage === "ground" ? "auto" : "none" }}
      >
        {/* Seasonal aerials, cross-faded by CSS opacity. All layers stay
            mounted (so a swap is instant and can never stack); only the
            active season is opaque. */}
        {seasons.map((s) => (
          <div
            key={s.key}
            aria-hidden={s.key !== activeSeason}
            className="absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none"
            style={{ opacity: s.key === activeSeason ? 1 : 0 }}
          >
            <Image
              src={s.src}
              alt={s.key === activeSeason ? `Downtown Frederick from above, ${SEASON_LABEL[s.key].toLowerCase()}` : ""}
              fill
              sizes="100vw"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
          </div>
        ))}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "radial-gradient(125% 80% at 50% 28%, transparent 38%, rgba(0,0,0,0.6) 100%)" }}
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-5 pt-12">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">From above</p>
            <h2 className="font-serif text-[23px] font-semibold leading-tight">Downtown Frederick</h2>
            <p className="text-[12px] text-white/70">
              {SEASON_LABEL[activeSeason]} · ~{activeAlt}m up · {places.length} places in view
            </p>
          </div>
          <button
            type="button"
            onClick={ascend}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-[13px] font-semibold backdrop-blur"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.24)" }}
          >
            <ChevronUp className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Ascend
          </button>
        </div>

        {/* pins bloom in */}
        {stage === "ground" &&
          places.map((p, i) =>
            p.slug === selected?.slug ? null : (
              <motion.button
                type="button"
                key={p.slug}
                layoutId={`card-${p.slug}`}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ top: PIN_POS[i % PIN_POS.length].top, left: PIN_POS[i % PIN_POS.length].left }}
                initial={bloom ? { scale: 0, opacity: 0, y: 12 } : false}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={
                  bloom
                    ? { delay: (reduce ? 0 : 0.5) + i * 0.09, type: "spring", stiffness: 340, damping: 21 }
                    : { duration: 0 }
                }
                whileTap={{ scale: 0.92 }}
                onClick={() => setSelected(p)}
                aria-label={p.name}
              >
                <motion.span
                  layoutId={`media-${p.slug}`}
                  className="relative block h-[52px] w-[52px] overflow-hidden rounded-[18px]"
                  style={{ boxShadow: `0 8px 20px -5px rgba(0,0,0,0.65), 0 0 0 2.5px ${p.color}` }}
                >
                  <Image src={p.photo} alt="" fill sizes="52px" className="object-cover" />
                </motion.span>
                <span className="pointer-events-none absolute left-1/2 top-[calc(100%+5px)] max-w-[30vw] -translate-x-1/2 truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                  {p.name}
                </span>
              </motion.button>
            ),
          )}

        {/* Season selector — fly the same downtown across the year. Each
            chip swaps the aerial to that season's nearest shot; the pins
            (the places) stay put. */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center gap-1.5 p-4 pb-9">
          {seasons.map((s) => {
            const on = s.key === activeSeason;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveSeason(s.key)}
                aria-pressed={on}
                className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold backdrop-blur transition active:scale-95"
                style={
                  on
                    ? { background: "rgba(255,255,255,0.92)", color: "#16140f" }
                    : {
                        background: "rgba(0,0,0,0.42)",
                        color: "rgba(255,255,255,0.85)",
                        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
                      }
                }
              >
                {SEASON_LABEL[s.key]}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ── PLACE: the pin morphs into the card ────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              className="absolute inset-0 z-20 bg-black/65 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            />
            <motion.div
              key={selected.slug}
              layoutId={`card-${selected.slug}`}
              className="absolute left-1/2 top-1/2 z-30 w-[min(86vw,360px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px]"
              style={{ background: "#16140f", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.85)" }}
            >
              <motion.span layoutId={`media-${selected.slug}`} className="relative block aspect-[4/3] w-full overflow-hidden">
                <Image src={selected.photo} alt={selected.name} fill sizes="360px" className="object-cover" />
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent 55%)" }}
                />
              </motion.span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/45 backdrop-blur"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </button>
              <motion.div className="space-y-2.5 p-4" initial={false} animate={{ opacity: 1, y: 0 }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: `color-mix(in srgb, ${selected.color} 30%, transparent)`, color: "#fff" }}
                  >
                    {selected.category}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold"
                    style={{ color: selected.open ? "#5fd08a" : "rgba(255,255,255,0.6)" }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: selected.open ? "#5fd08a" : "rgba(255,255,255,0.45)" }}
                      aria-hidden
                    />
                    {selected.open ? "Open now" : "Closed"}
                  </span>
                </div>
                <h3 className="font-serif text-[22px] font-semibold leading-tight">{selected.name}</h3>
                <Link
                  href={`/places/${selected.slug}`}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-black"
                >
                  Open place <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </Link>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
