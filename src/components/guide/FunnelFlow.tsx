"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Search, MapPin, CalendarDays, Activity, Layers, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { INTENT_BY_KEY, type IntentKey, type SubIntent } from "@/data/intents";
import { LIVE_MUSIC_VENUE_SLUGS } from "@/data/live-music-venues";
import { useClientPlaces } from "@/hooks/useClientPlaces";
import type { PlaceCardData } from "@/lib/loaders/places";
import { useGeolocation } from "@/hooks/useGeolocation";
import PlaceCard from "@/components/place/PlaceCard";
import Pill from "@/components/ui/Pill";
import Skeleton from "@/components/ui/Skeleton";
import { isOpenNow } from "@/lib/hours";
import { haversineMeters } from "@/lib/geo";
import { placeQuality } from "@/lib/quality/placeQuality";
import { frederickHour } from "@/lib/search-suggestions";
import { haptic } from "@/lib/haptics";
import { track } from "@vercel/analytics";
import { INTENT_ICON } from "./intentIcons";
import BetaIntroCard from "@/components/today/BetaIntroCard";
import AskFrederick from "@/components/ask/AskFrederick";

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
const TOP: IntentKey[] = ["eat", "coffee", "outdoor", "shop", "arts", "family", "wellness", "stay", "faith", "civic"];

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

// Situational lenses — find by the moment, ACROSS categories, using the
// place `tags` we already hold. Honest by construction: only lenses with
// a real, populated tagged set ship here. The thin/empty ones were cut so
// a tap never dead-ends in an empty or junk list — patio (0 tagged),
// groups (4), rainy-day (3), and the inflated "Local favorites" (622 of
// 1,675 places carry the flag — a meaningless 37%). The Ask box covers
// those long-tail moments far better than a near-empty chip.
type Lens = { key: string; label: string; match: (p: PlaceCardData) => boolean };
const hasTag = (p: PlaceCardData, t: string) => (p.tags ?? []).includes(t);
const LENSES: Lens[] = [
  { key: "date-night", label: "Date night", match: (p) => hasTag(p, "date-night") },
  { key: "with-kids", label: "With kids", match: (p) => hasTag(p, "kids-0-5") || hasTag(p, "kids-6-12") || hasTag(p, "family") },
  { key: "dog", label: "Dog-friendly", match: (p) => hasTag(p, "dog-friendly") },
  { key: "live-music", label: "Live music", match: (p) => LIVE_MUSIC_VENUE_SLUGS.has(p.slug) },
];

// The other doors. Radius's job is finding a PLACE; the rest of the app
// has its own homes — "what's on" is the Events tab, the live county is
// the Today tab's pulse, the spatial browse is the Map tab. So instead of
// re-listing 16 utility links here (they all live one tap away in the
// header "Field guide" drawer), the front door keeps just four signposts
// to where each non-place job already lives — and stops being a directory.
type Elsewhere = { href: string; label: string; icon: LucideIcon };
const ELSEWHERE: Elsewhere[] = [
  { href: "/events",      label: "What's on",                icon: CalendarDays },
  { href: "/pulse",       label: "Right now in the county",  icon: Activity },
  { href: "/map",         label: "Browse the map",           icon: MapPin },
  { href: "/collections", label: "Editorial collections",    icon: Layers },
];

export default function FunnelFlow({
  weather,
}: {
  /** Current conditions for the header, fetched server-side in the
   *  /guide page (NWS, ISR-cached). Absent → the header omits weather. */
  weather?: { tempF: number; condition: string };
}) {
  const { places, ready } = useClientPlaces();
  const reduce = useReducedMotion();
  const [intentKey, setIntentKey] = useState<IntentKey | null>(null);
  const [chosenSub, setChosenSub] = useState<SubIntent | "all" | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [lens, setLens] = useState<Lens | null>(null);
  const { state: geo, request: requestGeo } = useGeolocation();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag: the daypart greeting must differ between SSR (none) and client (real hour), so it can only resolve post-mount
  useEffect(() => setMounted(true), []);
  // Daypart greeting + "good right now" picks resolve only after mount,
  // so SSR and the first client paint match.
  const nowHour = mounted ? frederickHour() : null;
  const greeting = nowHour !== null ? daypartGreeting(nowHour) : null;
  // Concrete "right now" line for the header — weekday + Eastern time.
  // Post-mount only (SSR has no stable clock), so it matches hydration.
  const nowLine = mounted
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date())
    : null;

  const intent = intentKey ? INTENT_BY_KEY[intentKey] : null;
  const hasSubs = !!(intent?.subIntents && intent.subIntents.length);
  const step: "intent" | "sub" | "results" = lens
    ? "results"
    : !intent
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
    if (!intent && !lens) return [];
    const origin = geo.status === "granted" ? { lng: geo.position.lng, lat: geo.position.lat } : null;
    let r = lens ? places.filter(lens.match) : places.filter(intent!.match);
    if (!lens && chosenSub && chosenSub !== "all") r = r.filter(chosenSub.match);
    if (openOnly) r = r.filter((p) => isOpenNow(p.open_status));
    // Distance only when we truly have the user's location — never imply
    // a distance we can't source. Rank: open now first, then nearest
    // (when located), else alphabetical.
    const ranked = origin ? r.map((p) => ({ ...p, distance_m: haversineMeters(origin, p.geom) })) : r.slice();
    ranked.sort((a, b) => {
      const ao = isOpenNow(a.open_status) ? 0 : 1;
      const bo = isOpenNow(b.open_status) ? 0 : 1;
      if (ao !== bo) return ao - bo; // open now first
      if (origin) {
        const byDist = (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
        if (byDist !== 0) return byDist; // then nearest
      }
      const byQuality = placeQuality(b) - placeQuality(a); // then most useful + confident
      if (byQuality !== 0) return byQuality;
      return a.name.localeCompare(b.name);
    });
    return ranked.slice(0, RESULT_CAP);
  }, [places, intent, lens, chosenSub, openOnly, geo]);

  const resultsSub = !ready
    ? "Finding places…"
    : `${results.length}${results.length === RESULT_CAP ? "+" : ""} ${openOnly ? "open " : ""}place${results.length === 1 ? "" : "s"} · ${geo.status === "granted" ? "nearest first" : "open now first"}`;

  // Result-header values, shared by the intent and lens paths.
  const resultColor = lens ? "var(--app-brand)" : intent?.color;
  const resultTitle = lens ? lens.label : chosenSub && chosenSub !== "all" ? chosenSub.label : intent?.label ?? "";
  const resultEyebrow = (lens
    ? `By the moment · ${lens.label}`
    : chosenSub && chosenSub !== "all"
      ? `${intent?.label} · ${chosenSub.label}`
      : intent?.label ?? ""
  ).toUpperCase();

  const back = () => {
    haptic("light");
    if (lens) {
      setLens(null);
      return;
    }
    if (step === "results" && hasSubs) setChosenSub(null);
    else {
      setIntentKey(null);
      setChosenSub(null);
    }
  };

  const transition: Transition = reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36, mass: 0.9 };
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
          <>
            {/* "Right now" line — weekday · time · temp · conditions.
                Live date/time (client, Eastern) + server-fetched NWS
                weather. Self-hides each part when unavailable; never a
                fabricated temp. */}
            {nowLine && (
              <span
                className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium"
                style={{ color: "var(--app-ink-3)" }}
              >
                <span className="tabular-nums">{nowLine}</span>
                {weather && (
                  <>
                    <span aria-hidden style={{ color: "var(--app-border)" }}>·</span>
                    <span className="font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                      {weather.tempF}°
                    </span>
                    <span className="truncate">{weather.condition}</span>
                  </>
                )}
              </span>
            )}
            <Link
              href="/search"
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold"
              style={{ color: "var(--app-ink-3)" }}
            >
              <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Search instead
            </Link>
          </>
        )}
        {step !== "intent" && (intent || lens) && (
          <span
            className="ml-auto truncate text-[12px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: resultColor }}
          >
            {lens ? lens.label : intent!.label}
            {!lens && chosenSub && chosenSub !== "all" ? ` › ${chosenSub.label}` : ""}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step === "intent" && (
          <motion.div key="intent" initial={variants.initial} animate={variants.animate} exit={variants.exit} transition={transition}>
            <div className="mb-3">
              <BetaIntroCard />
            </div>
            <Header eyebrow={greeting ? `${greeting.toUpperCase()} · FREDERICK COUNTY` : "FREDERICK COUNTY"} title="What are you after?" sub="Pick one — it narrows from there." />
            {/* Ask Frederick — the concierge: one box that answers from
                real data. Sits above the grid as the fastest path. */}
            <div className="mb-5">
              <AskFrederick />
            </div>
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
                      track("find_intent", { intent: k });
                      setChosenSub(null);
                      setIntentKey(k);
                    }}
                  />
                );
              })}
            </Grid>
            <div className="mt-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--app-ink-3)" }}>
                Or by the moment
              </p>
              <div className="flex flex-wrap gap-2">
                {LENSES.map((l) => (
                  <Pill key={l.key} tone="ink" size="sm" onClick={() => { haptic("light"); track("find_lens", { lens: l.key }); setLens(l); }}>
                    {l.label}
                  </Pill>
                ))}
              </div>
            </div>
            {/* The other doors — four signposts to where each non-place
                job already lives (Events / Today's pulse / Map /
                Collections), instead of the old 16-link directory wall. */}
            <div className="mt-7">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--app-ink-3)" }}>
                Looking for something else?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ELSEWHERE.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => { haptic("light"); track("find_elsewhere", { to: href }); }}
                    className="tactile tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-2.5"
                    style={{ background: "var(--app-bg-elevated)" }}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
                      {label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
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

        {step === "results" && (intent || lens) && (
          <motion.div key="results" initial={variants.initial} animate={variants.animate} exit={variants.exit} transition={transition}>
            <Header
              eyebrow={resultEyebrow}
              title={resultTitle}
              sub={resultsSub}
              color={resultColor}
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
              <motion.ul
                className="space-y-3"
                variants={reduce ? undefined : tilesContainer}
                initial={reduce ? false : "hidden"}
                animate="show"
              >
                {results.map((p, i) => (
                  <motion.li key={p.slug} variants={reduce ? undefined : tileItem}>
                    {i === 0 ? <AnswerLead place={p} /> : <PlaceCard place={p} variant="row" />}
                  </motion.li>
                ))}
                {results.length > 1 && (
                  <motion.li
                    variants={reduce ? undefined : tileItem}
                    className="pt-1 text-center text-[11px] italic leading-relaxed"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {geo.status === "granted"
                      ? "Open now & nearest first — tap any for hours, photos & reviews."
                      : "Open now first, then the most useful. Turn on location to sort by nearest."}
                  </motion.li>
                )}
              </motion.ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// The funnel's lead pick, with food photos. The heavy google_photos[]
// array is stripped from the client place payload, so we fetch the
// venue's extra Google photos on demand (the same enrich route the
// detail sheet uses) and hand them to the answer card's photo strip.
function AnswerLead({ place }: { place: PlaceCardData }) {
  const [photos, setPhotos] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/place/${place.slug}/enrich`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.photos)) setPhotos(d.photos as string[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [place.slug]);
  return <PlaceCard place={place} variant="answer" galleryPhotos={photos ?? undefined} />;
}

function Header({ eyebrow, title, sub, color }: { eyebrow: string; title: string; sub?: string; color?: string }) {
  return (
    <div className="pb-5">
      <p className="eyebrow" style={{ color: color ?? "var(--app-ink-3)" }}>
        {eyebrow}
      </p>
      <h1 className="display-2 mt-2" style={{ color: "var(--app-ink)" }}>
        {title}
      </h1>
      {sub && (
        <p className="text-body-lg text-pretty mt-2" style={{ color: "var(--app-ink-3)" }}>
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
  blurb: _blurb,
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
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={tileItem}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="group relative flex min-h-[112px] flex-col items-start gap-2.5 rounded-[var(--app-radius-lg)] border p-4 text-left"
      style={{
        background: "var(--app-bg-elevated-solid)",
        borderColor: "var(--app-border)",
        boxShadow: "0 4px 16px rgba(25,23,20,0.05)",
      }}
    >
      {/* iOS-style colored icon square — the single spot of color per
          tile (clean, not the busy gradient-glow chip). White glyph. */}
      {icon && (
        <span
          className="grid h-10 w-10 place-items-center rounded-[12px] text-white"
          style={{ background: color, boxShadow: `0 5px 12px -4px ${color}` }}
        >
          {icon}
        </span>
      )}
      <span className="text-[15.5px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
        {label}
      </span>
      {typeof count === "number" && (
        <span className="text-meta mt-auto tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {count} place{count === 1 ? "" : "s"}
        </span>
      )}
      <ChevronRight
        className="absolute right-3 top-4 h-4 w-4"
        strokeWidth={2.25}
        style={{ color: "var(--app-ink-3)", opacity: 0.45 }}
        aria-hidden
      />
    </motion.button>
  );
}
