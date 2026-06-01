"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Search, MapPin } from "lucide-react";
import Link from "next/link";
import { INTENT_BY_KEY, type IntentKey, type SubIntent } from "@/data/intents";
import { useClientPlaces } from "@/hooks/useClientPlaces";
import { useGeolocation } from "@/hooks/useGeolocation";
import PlaceCard from "@/components/place/PlaceCard";
import Pill from "@/components/ui/Pill";
import Skeleton from "@/components/ui/Skeleton";
import { isOpenNow } from "@/lib/hours";
import { haversineMeters } from "@/lib/geo";
import { frederickHour } from "@/lib/search-suggestions";
import { haptic } from "@/lib/haptics";
import { INTENT_ICON } from "./intentIcons";

/**
 * FunnelFlow — the "what are you after?" front door.
 *
 * Open → pick a need → the next set appears → the answer. No map, no
 * dashboard. Each tap narrows; the choices and the matches both come
 * from the real `INTENTS` data (the same `match` predicates the map
 * uses) run against the client place set. Mobile-first, tactile,
 * reduced-motion aware.
 *
 * v1 scope: intent → kind → matched places. Open-now / nearest sorting
 * is the next layer (the quality_score pass), deliberately not here.
 */

// The out-of-the-gate choices. Curated from INTENTS to avoid the
// winery/brewery overlap (those live under Eat's sub-intents). This
// ordered list is the single thing to tune as the product owner decides
// the real top level (add Shop? split Drinks? add Tonight/events?).
const TOP: IntentKey[] = ["eat", "coffee", "outdoor", "arts", "family", "wellness", "civic"];

const RESULT_CAP = 24;

// Premium entrance: tiles settle in with a gentle spring stagger.
const tilesContainer: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } };
const tileItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.34, 1.4, 0.5, 1] } },
};

function daypartGreeting(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Tonight";
}

export default function FunnelFlow() {
  const { places, ready } = useClientPlaces();
  const reduce = useReducedMotion();
  const [intentKey, setIntentKey] = useState<IntentKey | null>(null);
  const [chosenSub, setChosenSub] = useState<SubIntent | "all" | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const { state: geo, request: requestGeo } = useGeolocation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Daypart greeting only after mount, so SSR and first paint match.
  const greeting = mounted ? daypartGreeting(frederickHour()) : null;

  const intent = intentKey ? INTENT_BY_KEY[intentKey] : null;
  const hasSubs = !!(intent?.subIntents && intent.subIntents.length);
  const step: "intent" | "sub" | "results" = !intent
    ? "intent"
    : hasSubs && chosenSub === null
      ? "sub"
      : "results";

  // Live per-intent counts so the first screen reads as real, not a menu.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!ready) return c;
    for (const k of TOP) c[k] = places.filter(INTENT_BY_KEY[k].match).length;
    return c;
  }, [ready, places]);

  const results = useMemo(() => {
    if (!intent) return [];
    const origin = geo.status === "granted" ? { lng: geo.position.lng, lat: geo.position.lat } : null;
    let r = places.filter(intent.match);
    if (chosenSub && chosenSub !== "all") r = r.filter(chosenSub.match);
    if (openOnly) r = r.filter((p) => isOpenNow(p.open_status));
    // Distance only when we truly have the user's location — never imply
    // a distance we can't source. Rank: open now first, then nearest
    // (when located), else alphabetical.
    const ranked = origin ? r.map((p) => ({ ...p, distance_m: haversineMeters(origin, p.geom) })) : r.slice();
    ranked.sort((a, b) => {
      const ao = isOpenNow(a.open_status) ? 0 : 1;
      const bo = isOpenNow(b.open_status) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (origin) return (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
      return a.name.localeCompare(b.name);
    });
    return ranked.slice(0, RESULT_CAP);
  }, [places, intent, chosenSub, openOnly, geo]);

  const resultsSub = !ready
    ? "Finding places…"
    : `${results.length}${results.length === RESULT_CAP ? "+" : ""} ${openOnly ? "open " : ""}place${results.length === 1 ? "" : "s"} · ${geo.status === "granted" ? "nearest first" : "open now first"}`;

  const back = () => {
    haptic("light");
    if (step === "results" && hasSubs) setChosenSub(null);
    else {
      setIntentKey(null);
      setChosenSub(null);
    }
  };

  const transition: Transition = reduce ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] };
  const variants = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -24 },
  };

  return (
    <div className="mx-auto w-full max-w-screen-sm px-4 pb-28 pt-3">
      {/* header row: back / search-instead + breadcrumb */}
      <div className="flex items-center gap-2 pb-2" style={{ minHeight: 34 }}>
        {step !== "intent" ? (
          <button
            type="button"
            onClick={back}
            className="tactile-interactive -ml-1 inline-flex items-center gap-1 rounded-full py-1 pl-1 pr-2.5 text-[13px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Back
          </button>
        ) : (
          <Link
            href="/search"
            className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Search instead
          </Link>
        )}
        {step !== "intent" && intent && (
          <span
            className="ml-auto truncate text-[12px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: intent.color }}
          >
            {intent.label}
            {chosenSub && chosenSub !== "all" ? ` › ${chosenSub.label}` : ""}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step === "intent" && (
          <motion.div key="intent" initial={variants.initial} animate={variants.animate} exit={variants.exit} transition={transition}>
            <Header eyebrow={greeting ? `${greeting.toUpperCase()} · FREDERICK COUNTY` : "FREDERICK COUNTY"} title="What are you after?" sub="Tap one. It narrows from there." />
            <Grid>
              {TOP.map((k) => {
                const it = INTENT_BY_KEY[k];
                const Icon = INTENT_ICON[it.icon];
                return (
                  <Tile
                    key={k}
                    color={it.color}
                    icon={<Icon className="h-5 w-5" strokeWidth={2} aria-hidden />}
                    label={it.label}
                    blurb={it.blurb}
                    count={counts[k]}
                    onClick={() => {
                      haptic("light");
                      setChosenSub(null);
                      setIntentKey(k);
                    }}
                  />
                );
              })}
            </Grid>
          </motion.div>
        )}

        {step === "sub" && intent && (
          <motion.div key="sub" initial={variants.initial} animate={variants.animate} exit={variants.exit} transition={transition}>
            <Header eyebrow={intent.label.toUpperCase()} title="What kind?" sub={intent.blurb} color={intent.color} />
            <Grid>
              <Tile
                color={intent.color}
                label={`All ${intent.label.toLowerCase()}`}
                blurb="Show everything"
                count={counts[intent.key]}
                onClick={() => {
                  haptic("light");
                  setChosenSub("all");
                }}
              />
              {intent.subIntents!.map((s) => (
                <Tile
                  key={s.key}
                  color={intent.color}
                  label={s.label}
                  onClick={() => {
                    haptic("light");
                    setChosenSub(s);
                  }}
                />
              ))}
            </Grid>
          </motion.div>
        )}

        {step === "results" && intent && (
          <motion.div key="results" initial={variants.initial} animate={variants.animate} exit={variants.exit} transition={transition}>
            <Header
              eyebrow={(chosenSub && chosenSub !== "all" ? `${intent.label} · ${chosenSub.label}` : intent.label).toUpperCase()}
              title={chosenSub && chosenSub !== "all" ? chosenSub.label : intent.label}
              sub={resultsSub}
              color={intent.color}
            />
            {ready && (
              <div className="flex flex-wrap gap-2 pb-3">
                <Pill tone="brand" size="sm" active={openOnly} onClick={() => { haptic("light"); setOpenOnly((v) => !v); }}>
                  Open now
                </Pill>
                {geo.status === "granted" ? (
                  <Pill tone="cool" size="sm" active icon={<MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />}>
                    Near you
                  </Pill>
                ) : (
                  <Pill tone="cool" size="sm" onClick={() => { haptic("light"); requestGeo(); }} icon={<MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />}>
                    {geo.status === "loading" ? "Locating…" : "Near me"}
                  </Pill>
                )}
              </div>
            )}
            {geo.status === "denied" && (
              <p className="-mt-1 pb-3 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                Location is off, so this is sorted by open-now. Turn it on for nearest-first.
              </p>
            )}
            {!ready ? (
              <div className="space-y-3" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton.Block key={i} height={84} round="var(--app-radius-lg)" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <p
                className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-[14px]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
              >
                Nothing matched yet.{" "}
                <button type="button" onClick={back} className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
                  Try another kind
                </button>
                .
              </p>
            ) : (
              <ul className="space-y-3">
                {results.map((p) => (
                  <li key={p.slug}>
                    <PlaceCard place={p} variant="row" />
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Header({ eyebrow, title, sub, color }: { eyebrow: string; title: string; sub?: string; color?: string }) {
  return (
    <div className="pb-4">
      <p className="eyebrow" style={{ color: color ?? "var(--app-ink-3)" }}>
        {eyebrow}
      </p>
      <h1
        className="mt-1 text-[28px] font-semibold leading-tight tracking-tight"
        style={{ color: "var(--app-ink)", fontFamily: "var(--font-display, Georgia, serif)" }}
      >
        {title}
      </h1>
      {sub && (
        <p className="mt-1.5 text-[14px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className="grid grid-cols-2 gap-3">{children}</div>;
  return (
    <motion.div className="grid grid-cols-2 gap-3" variants={tilesContainer} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

function Tile({
  color,
  icon,
  label,
  blurb,
  count,
  onClick,
}: {
  color: string;
  icon?: ReactNode;
  label: string;
  blurb?: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={tileItem}
      whileTap={{ scale: 0.97 }}
      className="tactile tactile-interactive flex min-h-[124px] flex-col items-start gap-1.5 rounded-[var(--app-radius-lg)] p-4 text-left"
      style={{ background: "var(--app-bg-elevated)" }}
    >
      <span
        className="mb-0.5 inline-flex h-11 w-11 items-center justify-center rounded-[14px]"
        style={{
          background: `linear-gradient(145deg, color-mix(in srgb, ${color} 20%, var(--app-bg-elevated)), color-mix(in srgb, ${color} 8%, var(--app-bg-elevated)))`,
          color,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, transparent)`,
        }}
      >
        {icon ?? <ChevronRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />}
      </span>
      <span
        className="mt-0.5 text-[16.5px] font-semibold leading-snug"
        style={{ color: "var(--app-ink)", fontFamily: "var(--font-display, Georgia, serif)" }}
      >
        {label}
      </span>
      {blurb && (
        <span className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {blurb}
        </span>
      )}
      {typeof count === "number" && (
        <span className="mt-auto inline-flex items-center gap-1.5 pt-1.5 text-[11px] font-semibold tabular-nums" style={{ color }}>
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: color }} aria-hidden />
          {count} place{count === 1 ? "" : "s"}
        </span>
      )}
    </motion.button>
  );
}
