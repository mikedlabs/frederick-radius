"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Search, MapPin, ArrowUpDown, Wine, Baby, Dog, Music, CalendarDays, Activity, Layers, type LucideIcon } from "lucide-react";
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
import { gateRecommendable, tierRank } from "@/lib/guided/rank";
import { frederickHour } from "@/lib/search-suggestions";
import { haptic } from "@/lib/haptics";
import { track } from "@vercel/analytics";
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
const TOP: IntentKey[] = ["eat", "coffee", "outdoor", "shop", "arts", "family", "wellness", "stay", "faith", "civic"];

const RESULT_CAP = 24;

// Result ordering the user can switch between (the smart default plus two
// literal, honest sorts). "nearest" only offered when we have location.
type SortKey = "best" | "nearest" | "rated";

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
type Lens = { key: string; label: string; Icon: LucideIcon; match: (p: PlaceCardData) => boolean };
const hasTag = (p: PlaceCardData, t: string) => (p.tags ?? []).includes(t);
const LENSES: Lens[] = [
  { key: "date-night", label: "Date night", Icon: Wine, match: (p) => hasTag(p, "date-night") },
  { key: "with-kids", label: "With kids", Icon: Baby, match: (p) => hasTag(p, "kids-0-5") || hasTag(p, "kids-6-12") || hasTag(p, "family") },
  { key: "dog", label: "Dog-friendly", Icon: Dog, match: (p) => hasTag(p, "dog-friendly") },
  { key: "live-music", label: "Live music", Icon: Music, match: (p) => LIVE_MUSIC_VENUE_SLUGS.has(p.slug) },
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
  { href: "/pulse",       label: "County pulse",  icon: Activity },
  { href: "/map",         label: "Browse the map",           icon: MapPin },
  { href: "/collections", label: "Collections",    icon: Layers },
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
  const [sort, setSort] = useState<SortKey>("best");
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
  // Two steps only: the lane grid, then results. Sub-types narrow IN
  // PLACE via a chip rail in the results header (no full-screen "what
  // kind?" detour), and they stack with Open now / Near me.
  const step: "intent" | "results" = intent || lens ? "results" : "intent";

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
    // Apply the audit's readiness gate: Tier-4 (closed/junk/non-discoverable)
    // never surfaces in a guided result, in any sort mode.
    r = gateRecommendable(r);
    // Distance only when we truly have the user's location — never imply
    // a distance we can't source.
    const ranked = origin ? r.map((p) => ({ ...p, distance_m: haversineMeters(origin, p.geom) })) : r.slice();
    // Tier-3 ("needs review" — B2B leaks, temp-closed, thin records) sinks
    // below Tier 1/2 in "best" so a real pick always leads; quality+proximity
    // already settles 1-vs-2, so we only demote the soft rows here.
    const demote = (p: PlaceCardData) => (tierRank(p) >= 3 ? 1 : 0);
    // Best order = a blend of nearby AND well-loved, not pure distance — so
    // the lead is genuinely the best pick (a great roaster four minutes
    // farther beats a mediocre one next door), never just the closest.
    //   • For "right now" lanes (preferOpen), open places still lead — you
    //     can't use a closed one.
    //   • relevance = placeQuality (rating, local-favorite, verified hours,
    //     photo, prose; ≈0..0.9) + a smooth distance decay (≈1.15 at your
    //     feet, halving roughly every mile). No location → quality-first
    //     ("top picks"). Every term is a real, explainable signal.
    const prefersOpen = !lens && !!intent?.preferOpen;
    const proximity = (d?: number) => (d == null ? 0 : Math.exp(-(d / 1000) / 2.4));
    const relevance = (p: PlaceCardData) => placeQuality(p) + 1.15 * proximity(p.distance_m);
    // Rating-forward score for "Top rated": a real rating with enough
    // reviews to mean something, nudged by review volume; unrated rows sink.
    const ratingRank = (p: PlaceCardData) => {
      const rating = p.google_rating;
      const count = p.google_rating_count ?? 0;
      if (typeof rating !== "number" || count < 20) return -1;
      return rating + Math.min(0.49, Math.log10(count) / 10);
    };
    // "Nearest" needs location; without it, fall back to the smart default.
    const mode: SortKey = sort === "nearest" && !origin ? "best" : sort;
    ranked.sort((a, b) => {
      if (mode === "nearest") {
        const byDist = (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
        return byDist !== 0 ? byDist : a.name.localeCompare(b.name);
      }
      if (mode === "rated") {
        // Top-rated — but when located, gently demote far-flung picks so a
        // 5★ sixteen miles away doesn't lead over a great spot down the
        // block (a contradiction the sims caught). Rating still dominates;
        // distance only settles great-vs-great. Free within ~3mi.
        const ratedScore = (p: PlaceCardData) => {
          const base = ratingRank(p);
          if (base < 0 || p.distance_m == null) return base;
          return base - Math.max(0, (p.distance_m / 1000 - 4.8) * 0.06);
        };
        const byRate = ratedScore(b) - ratedScore(a);
        return Math.abs(byRate) > 1e-9 ? byRate : a.name.localeCompare(b.name);
      }
      // "best": open now leads for "right now" lanes, then a blend of
      // nearby AND well-loved (never just the closest).
      if (prefersOpen) {
        const ao = isOpenNow(a.open_status) ? 0 : 1;
        const bo = isOpenNow(b.open_status) ? 0 : 1;
        if (ao !== bo) return ao - bo;
      }
      const ad = demote(a);
      const bd = demote(b);
      if (ad !== bd) return ad - bd;
      const byRel = relevance(b) - relevance(a);
      if (Math.abs(byRel) > 1e-6) return byRel;
      if (origin) {
        const byDist = (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
        if (byDist !== 0) return byDist;
      }
      return a.name.localeCompare(b.name);
    });
    return ranked.slice(0, RESULT_CAP);
  }, [places, intent, lens, chosenSub, openOnly, geo, sort]);

  const sortLabel =
    sort === "nearest" ? "nearest first" : sort === "rated" ? "top rated" : geo.status === "granted" ? "best nearby" : "top picks";
  const resultsSub = !ready
    ? "Finding places…"
    : `${results.length}${results.length === RESULT_CAP ? "+" : ""} ${openOnly ? "open " : ""}place${results.length === 1 ? "" : "s"} · ${sortLabel}`;
  // The sort control's options — "Nearest" only appears once we have a
  // location to make it meaningful.
  const sortOpts: { key: SortKey; label: string }[] = [
    { key: "best", label: "Best" },
    ...(geo.status === "granted" ? [{ key: "nearest" as const, label: "Nearest" }] : []),
    { key: "rated", label: "Top rated" },
  ];

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
    setOpenOnly(false); // returning toward the front door clears the open-now filter so the next lane starts fresh
    if (lens) {
      setLens(null);
      return;
    }
    setIntentKey(null);
    setChosenSub(null);
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
            <Header eyebrow={greeting ? `${greeting.toUpperCase()} · FREDERICK COUNTY` : "FREDERICK COUNTY"} title="What are you after?" sub="Pick one. It narrows from there." />
            {/* The funnel leads: the lane grid is the front door. The
                concierge ("Ask Radius anything.") lives on /today; the
                quiet "Search instead" link in the header covers a typed
                query here, so the Guide stays one clear outcome path
                instead of two competing "ask me" boxes. */}
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
                  <Pill key={l.key} tone="ink" size="sm" icon={<l.Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />} onClick={() => { haptic("light"); track("find_lens", { lens: l.key }); setLens(l); }}>
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

        {step === "results" && (intent || lens) && (
          <motion.div key="results" initial={variants.initial} animate={variants.animate} exit={variants.exit} transition={transition}>
            <Header
              eyebrow={resultEyebrow}
              title={resultTitle}
              sub={resultsSub}
              color={resultColor}
            />
            {/* Narrow in place — the lane's sub-types as a combinable chip
                rail. Single-select; tapping the active chip clears back to
                All. Stacks with Open now / Near me below, and the result
                list updates live with no full-screen jump. */}
            {ready && intent && hasSubs && !lens && (
              <div className="-mx-4 mb-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max gap-2">
                  <Pill
                    tone="brand"
                    size="sm"
                    active={!chosenSub || chosenSub === "all"}
                    style={!chosenSub || chosenSub === "all" ? { background: intent.color, backgroundImage: "var(--app-gloss)", color: "#fff" } : undefined}
                    onClick={() => { haptic("light"); setChosenSub(null); }}
                  >
                    All
                  </Pill>
                  {intent.subIntents!.map((s) => {
                    const isActive = chosenSub !== null && chosenSub !== "all" && chosenSub.key === s.key;
                    return (
                      <Pill
                        key={s.key}
                        tone="brand"
                        size="sm"
                        active={isActive}
                        style={isActive ? { background: intent.color, backgroundImage: "var(--app-gloss)", color: "#fff" } : undefined}
                        onClick={() => {
                          haptic("light");
                          track("find_sub", { intent: intent.key, sub: s.key });
                          setChosenSub(isActive ? null : s);
                        }}
                      >
                        {s.label}
                      </Pill>
                    );
                  })}
                </div>
              </div>
            )}
            {ready && (
              <div className="flex items-center gap-2 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Pill tone="brand" size="sm" className="shrink-0" active={openOnly} onClick={() => { haptic("light"); setOpenOnly((v) => !v); }}>
                  Open now
                </Pill>
                {geo.status === "granted" ? (
                  <Pill tone="cool" size="sm" className="shrink-0" active icon={<MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />}>
                    Near you
                  </Pill>
                ) : (
                  <Pill tone="cool" size="sm" className="shrink-0" onClick={() => { haptic("light"); requestGeo(); }} icon={<MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />}>
                    {geo.status === "loading" ? "Locating…" : "Near me"}
                  </Pill>
                )}
                {/* Sort, divided from the filters. The whole row scrolls
                    horizontally on narrow screens instead of wrapping to a
                    second line — one control row, not two. */}
                <span aria-hidden className="mx-0.5 h-5 w-px shrink-0" style={{ background: "var(--app-border)" }} />
                <ArrowUpDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                {sortOpts.map((o) => (
                  <Pill
                    key={o.key}
                    tone="cool"
                    size="sm"
                    className="shrink-0"
                    active={sort === o.key}
                    onClick={() => { haptic("light"); track("find_sort", { sort: o.key }); setSort(o.key); }}
                  >
                    {o.label}
                  </Pill>
                ))}
              </div>
            )}
            {geo.status === "denied" && (
              <p className="-mt-1 pb-3 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                Location is off, so this shows our top picks. Turn it on for the best nearby.
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
                    {i === 0 ? <AnswerLead place={p} /> : <PlaceCard place={p} variant="row" showSource={false} />}
                  </motion.li>
                ))}
                {results.length > 1 && (
                  <motion.li
                    variants={reduce ? undefined : tileItem}
                    className="pt-1 text-center text-[11px] italic leading-relaxed"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {sort === "nearest"
                      ? "Closest first. Tap any for hours, photos & reviews."
                      : sort === "rated"
                        ? "Highest-rated first (enough reviews to be real). Tap any for hours, photos & reviews."
                        : geo.status === "granted"
                          ? "Ranked by the best balance of nearby & well-loved. Tap any for hours, photos & reviews."
                          : "Ranked by our most useful, best-reviewed picks. Turn on location for the best nearby."}
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
  count,
  onClick,
}: {
  color: string;
  icon?: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  const reduce = useReducedMotion();

  // Typographic paper tile — the single, consistent lane treatment. The
  // lane's color breathes from the top-left and fades into paper; layered
  // edge + inner highlight + ambient elevation give it the "made" depth.
  // No place photos: the grid reads as one calm, typographic system
  // (matching the rest of the app), not a mix of photo and paper cards.
  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={tileItem}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="group relative flex min-h-[120px] flex-col items-start gap-3 rounded-[var(--app-radius-lg)] p-4 text-left"
      style={{
        background: `linear-gradient(155deg, color-mix(in srgb, ${color} 11%, var(--app-bg-elevated-solid)) 0%, var(--app-bg-elevated-solid) 58%)`,
        boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)",
      }}
    >
      {icon && (
        <span
          className="grid h-11 w-11 place-items-center rounded-[14px] text-white"
          style={{
            background: color,
            backgroundImage: "var(--app-gloss)",
            boxShadow: `0 6px 16px -5px ${color}, inset 0 1px 0 rgba(255,255,255,0.38)`,
          }}
        >
          {icon}
        </span>
      )}
      <span className="text-[15.5px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
        {label}
      </span>
      {typeof count === "number" && (
        <span className="text-meta mt-auto inline-flex items-center gap-1.5 tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, opacity: 0.85 }} aria-hidden />
          {count} place{count === 1 ? "" : "s"}
        </span>
      )}
      <ChevronRight
        className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
        strokeWidth={2.25}
        style={{ color: "var(--app-ink-3)", opacity: 0.4 }}
        aria-hidden
      />
    </motion.button>
  );
}
