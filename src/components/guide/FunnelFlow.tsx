"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Search, ArrowRight, MapPin, ArrowUpDown, Wine, Beer, Baby, Dog, Music, Building2, type LucideIcon } from "lucide-react";
import { placesWithHappyHour } from "@/lib/loaders/businessInfo";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { INTENT_BY_KEY, type IntentKey, type SubIntent } from "@/data/intents";
import { LIVE_MUSIC_VENUE_SLUGS } from "@/data/live-music-venues";
import { useClientPlaces } from "@/hooks/useClientPlaces";
import type { PlaceCardData } from "@/lib/loaders/places";
import { useGeolocation } from "@/hooks/useGeolocation";
import PlaceCard from "@/components/place/PlaceCard";
import IconStamp from "@/components/ui/IconStamp";
import LiveDowntown from "@/components/guide/LiveDowntown";
import type { LiveShow } from "@/lib/guide/live-downtown";
import Pill from "@/components/ui/Pill";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
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

// The out-of-the-gate choices. Six core "what do I do in town" needs —
// the calm front door. Edge cases (wellness, stay, faith, civic) are
// reachable via the Ask input and the town door, so the grid stays a
// confident six instead of a ten-card directory wall.
const TOP: IntentKey[] = ["eat", "coffee", "outdoor", "shop", "arts", "family"];

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
// Happy-hour venues come from the business-info ingest (a real `happy_hour`
// string scraped from each venue's own site). Surfaced as a lens only when
// the set is non-trivial, so the front door never offers an empty/thin chip.
const HAPPY_HOUR_SLUGS = new Set(placesWithHappyHour().map((p) => p.slug));
const LENSES: Lens[] = [
  { key: "date-night", label: "Date night", Icon: Wine, match: (p) => hasTag(p, "date-night") },
  { key: "with-kids", label: "With kids", Icon: Baby, match: (p) => hasTag(p, "kids-0-5") || hasTag(p, "kids-6-12") || hasTag(p, "family") },
  ...(HAPPY_HOUR_SLUGS.size >= 3
    ? [{ key: "happy-hour", label: "Happy hour", Icon: Beer, match: (p: PlaceCardData) => HAPPY_HOUR_SLUGS.has(p.slug) }]
    : []),
  { key: "dog", label: "Dog-friendly", Icon: Dog, match: (p) => hasTag(p, "dog-friendly") },
  { key: "live-music", label: "Live music", Icon: Music, match: (p) => LIVE_MUSIC_VENUE_SLUGS.has(p.slug) },
];

// Radius's job is finding a PLACE; the rest of the app has its own homes
// (Events, Map, Collections all live in the nav). The front door keeps a
// single place-led signpost — the town door — instead of a directory grid.

export default function FunnelFlow({ liveShows = [], hideHeader = false }: { liveShows?: LiveShow[]; hideHeader?: boolean }) {
  const { places, ready } = useClientPlaces();
  const reduce = useReducedMotion();
  // GUIDED-FLOW STATE LIVES IN THE URL (June-9 deep audit P1-12). The
  // step used to be useState: refresh dropped the user back to step one,
  // browser Back exited the flow instead of stepping back, and a
  // narrowed view couldn't be shared. `?need=eat&sub=brunch` is now the
  // source of truth — Next syncs useSearchParams with the native
  // history.pushState/replaceState calls in setStep below, so Back
  // steps back through intents while sub-chip toggles replace in place
  // (no history spam). Invalid params degrade to step one.
  const sp = useSearchParams();
  const needParam = sp.get("need");
  const intentKey: IntentKey | null =
    needParam && needParam in INTENT_BY_KEY ? (needParam as IntentKey) : null;
  const subParam = sp.get("sub");
  const setStep = (
    need: IntentKey | null,
    sub: SubIntent | "all" | null,
    mode: "push" | "replace" = "push",
  ) => {
    const q = new URLSearchParams(window.location.search);
    if (need) q.set("need", need);
    else q.delete("need");
    if (sub) q.set("sub", sub === "all" ? "all" : sub.key);
    else q.delete("sub");
    const url = q.size ? `?${q.toString()}` : window.location.pathname;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  };
  const [openOnly, setOpenOnly] = useState(false);
  // Must-have narrowing (the brief's filter axis). Both map to real fields:
  // walkable needs a location (distance), local-favorite is a curation flag.
  const [walkOnly, setWalkOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
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

  const intent = intentKey ? INTENT_BY_KEY[intentKey] : null;
  // Rehydrate the sub-intent OBJECT from its URL key against the active
  // intent's own list — an alien key simply degrades to "no sub filter."
  const chosenSub: SubIntent | "all" | null =
    subParam === "all"
      ? "all"
      : subParam
        ? (intent?.subIntents?.find((s) => s.key === subParam) ?? null)
        : null;
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
    if (favOnly) r = r.filter((p) => p.local_favorite);
    // Apply the audit's readiness gate: Tier-4 (closed/junk/non-discoverable)
    // never surfaces in a guided result, in any sort mode.
    r = gateRecommendable(r);
    // Distance only when we truly have the user's location — never imply
    // a distance we can't source.
    let ranked = origin ? r.map((p) => ({ ...p, distance_m: haversineMeters(origin, p.geom) })) : r.slice();
    // Walkable = within ~15 min on foot. Only meaningful with a location, so
    // the chip itself is gated on geo too.
    if (walkOnly && origin) ranked = ranked.filter((p) => (p.distance_m ?? Infinity) <= 1200);
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
  }, [places, intent, lens, chosenSub, openOnly, favOnly, walkOnly, geo, sort]);

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
    setOpenOnly(false); // returning toward the front door clears the filters so the next lane starts fresh
    setWalkOnly(false);
    setFavOnly(false);
    if (lens) {
      setLens(null);
      return;
    }
    setStep(null, null);
  };

  const transition: Transition = reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36, mass: 0.9 };
  const variants = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -24 },
  };

  return (
    <div className="mx-auto w-full max-w-screen-sm px-4 pb-28 pt-2">
      {/* Results step only: a quiet back affordance + the selected
          intent/lens breadcrumb. The intent step opens clean — no top
          strip competing with the hero. */}
      {step !== "intent" && (
        <div className="flex items-center gap-2 pb-3" style={{ minHeight: 34 }}>
          <button
            type="button"
            onClick={back}
            className="tactile-interactive -ml-1 inline-flex items-center gap-1 rounded-full py-1 pl-1 pr-2.5 text-[13px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Back
          </button>
          {(intent || lens) && (
            <span
              className="ml-auto truncate text-[12px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: resultColor }}
            >
              {lens ? lens.label : intent!.label}
              {!lens && chosenSub && chosenSub !== "all" ? ` › ${chosenSub.label}` : ""}
            </span>
          )}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {step === "intent" && (
          <motion.div key="intent" initial={variants.initial} animate={variants.animate} exit={variants.exit} transition={transition}>
            {/* ── HERO — one calm eyebrow, one confident question, one line.
                Compact: minimal top/bottom air so the lanes climb above the
                fold (density pass — dense & utility-modern). */}
            {!hideHeader && (
              <header className="pb-2.5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.13em]" style={{ color: "var(--app-ink-3)" }}>
                  {greeting ? `${greeting} · Frederick County` : "Frederick County"}
                </p>
                <h1 className="display-2 mt-1" style={{ color: "var(--app-ink)" }}>
                  What are you looking for?
                </h1>
              </header>
            )}

            {/* ── ASK INPUT — the obvious first action. A frosted, translucent
                search field that opens the typed-query screen. The backdrop
                blur lets the PageBloom glow through (fluid, native), so it
                reads as floating glass, not flat paper. Sits above the lanes
                so "just tell me" always leads; the cards are the browse path
                for when you'd rather tap than type. */}
            <Link
              href="/search"
              onClick={() => haptic("light")}
              aria-label="Ask or search Frederick Radius"
              className="tactile tactile-interactive group flex items-center gap-3 rounded-full py-3 pl-4 pr-2.5 backdrop-blur-xl"
              style={{ background: "color-mix(in srgb, var(--app-bg-elevated-solid) 62%, transparent)", boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)" }}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)", color: "var(--app-brand)" }}
              >
                <Search className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: "var(--app-ink-3)" }}>
                Coffee open now, date night, trails…
              </span>
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform group-active:scale-95"
                style={{ background: "var(--app-brand)", color: "var(--app-on-brand, #fff)" }}
                aria-hidden
              >
                <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </span>
            </Link>

            {/* ── BROWSE BY NEED — a BENTO of frosted lanes. The first lane
                (Eat & drink — the most-tapped need) leads as a wide, taller
                cell spanning both columns; the rest fall in as 2-up cells.
                The asymmetry gives the grid hierarchy + rhythm instead of
                six identical squares, and lifts more above the fold. */}
            <p className="mb-2 mt-3.5 text-[12px] font-semibold uppercase tracking-[0.13em]" style={{ color: "var(--app-ink-3)" }}>
              Or browse by need
            </p>
            <Grid>
              {TOP.map((k, i) => {
                const it = INTENT_BY_KEY[k];
                const Icon = INTENT_ICON[it.icon];
                const lead = i === 0; // the lead lane — wide + tall
                return (
                  <Tile
                    key={k}
                    lead={lead}
                    color={it.color}
                    icon={<Icon className={lead ? "h-[24px] w-[24px]" : "h-[22px] w-[22px]"} strokeWidth={2} aria-hidden />}
                    label={it.label}
                    count={counts[k]}
                    onClick={() => {
                      haptic("light");
                      track("find_intent", { intent: k });
                      setStep(k, null);
                    }}
                  />
                );
              })}
            </Grid>

            {/* ── BY THE MOMENT — progressive disclosure (Premium Overhaul
                Phase 2). The five moment lenses moved behind ONE quiet
                trigger so the screen above the fold holds the input and
                the six needs, nothing else. The declutter math: the page
                presented 13 in-page targets; it now presents 8. */}
            <CollapsibleSection
              title="By the moment"
              count={LENSES.length}
              storageKey="fr.guide.lenses"
              defaultOpen={false}
              className="mt-3.5"
            >
              <div className="flex flex-wrap gap-1.5 pt-1">
                {LENSES.map((l) => (
                  <Pill key={l.key} tone="ink" size="sm" icon={<l.Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />} onClick={() => { haptic("light"); track("find_lens", { lens: l.key }); setLens(l); }}>
                    {l.label}
                  </Pill>
                ))}
              </div>
            </CollapsibleSection>

            {/* ── TOWN DOOR — one clear place-led entry, full width. Slim +
                frosted to match the lanes (translucent glass over the bloom). */}
            <Link
              href="/towns"
              onClick={() => { haptic("light"); track("find_elsewhere", { to: "/towns" }); }}
              className="tactile tactile-interactive group mt-3.5 flex items-center gap-3 rounded-[var(--app-radius-lg)] px-3.5 py-2.5 backdrop-blur-xl"
              style={{ background: "color-mix(in srgb, var(--app-bg-elevated-solid) 58%, transparent)", boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-1)" }}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]"
                style={{ background: "color-mix(in srgb, var(--app-ink) 7%, transparent)", color: "var(--app-ink-2)" }}
              >
                <Building2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                  Explore by town
                </span>
                <span className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                  Frederick, Brunswick, Thurmont &amp; more
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-active:translate-x-0.5" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
            </Link>

            {/* ── LIVE DOWNTOWN — the one warm, saturated beat: the three
                flagship stage programs (Alive @ Five, the Weinberg,
                SilverVox) in the Alive @ Five sunset palette, so the
                live-music plan reads as an occasion, not a list row. */}
            <LiveDowntown shows={liveShows} />
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
                    onClick={() => { haptic("light"); setStep(intentKey, null, "replace"); }}
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
                          setStep(intentKey, isActive ? null : s, "replace");
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
                {geo.status === "granted" && (
                  <Pill tone="brand" size="sm" className="shrink-0" active={walkOnly} onClick={() => { haptic("light"); track("find_musthave", { kind: "walkable" }); setWalkOnly((v) => !v); }}>
                    Walkable
                  </Pill>
                )}
                <Pill tone="brand" size="sm" className="shrink-0" active={favOnly} onClick={() => { haptic("light"); track("find_musthave", { kind: "local_favorite" }); setFavOnly((v) => !v); }}>
                  Local favorite
                </Pill>
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
                {openOnly || walkOnly || favOnly ? (
                  <>
                    Nothing matches all of that.{" "}
                    <button type="button" onClick={() => { haptic("light"); setOpenOnly(false); setWalkOnly(false); setFavOnly(false); }} className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
                      Clear filters
                    </button>{" "}
                    to see more.
                  </>
                ) : (
                  <>
                    Nothing matched yet.{" "}
                    <button type="button" onClick={back} className="font-semibold underline" style={{ color: "var(--app-brand)" }}>
                      Try another kind
                    </button>
                    .
                  </>
                )}
              </p>
            ) : (
              <motion.div
                className="space-y-6"
                variants={reduce ? undefined : tilesContainer}
                initial={reduce ? false : "hidden"}
                animate="show"
              >
                {/* Best match — one strong lead. The accent tick + a soft
                    colored glow beneath the card make it read as CHOSEN, not
                    just the first row of a list. */}
                <motion.section variants={reduce ? undefined : tileItem}>
                  <SectionLabel accent={resultColor}>Best match</SectionLabel>
                  <div
                    className="rounded-[var(--app-radius-lg)]"
                    style={{ boxShadow: `0 16px 36px -20px color-mix(in srgb, ${resultColor} 60%, transparent)` }}
                  >
                    <AnswerLead place={results[0]} />
                  </div>
                </motion.section>

                {/* Also good — a few supporting picks. */}
                {results.length > 1 && (
                  <motion.section variants={reduce ? undefined : tileItem}>
                    <SectionLabel>Also good</SectionLabel>
                    <ul className="space-y-3">
                      {results.slice(1, 4).map((p) => (
                        <li key={p.slug}>
                          <PlaceCard place={p} variant="row" showSource={false} />
                        </li>
                      ))}
                    </ul>
                  </motion.section>
                )}

                {/* Keep looking — the rest, only if there's more. Rendered
                    COMPACT (no status/rating chip row) and at a tighter
                    rhythm, so the tail reads as a lighter "more options"
                    list — the third tier below Best match (hero) and Also
                    good (standard row). */}
                {results.length > 4 && (
                  <motion.section variants={reduce ? undefined : tileItem}>
                    <SectionLabel count={results.length - 4}>Keep looking</SectionLabel>
                    <ul className="space-y-2">
                      {results.slice(4).map((p) => (
                        <li key={p.slug}>
                          <PlaceCard place={p} variant="row" compact showSource={false} />
                        </li>
                      ))}
                    </ul>
                  </motion.section>
                )}

                <motion.p
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
                </motion.p>
              </motion.div>
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

// Bento grid — a two-column flow where the first child (the lead lane)
// is asked to span both columns via `col-span-2` on the Tile itself, so
// the grid reads as one wide hero lane over a field of smaller cells.
// Tightened gap (gap-2.5) for the density pass.
function Grid({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
  return (
    <motion.div className="grid grid-cols-2 gap-2.5" variants={tilesContainer} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

// A calm result-section heading — Best match / Also good / Keep looking.
// Deliberately NOT a tiny uppercase eyebrow; a confident sans label with an
// optional count, so results read as curated blocks, not one long list. An
// `accent` renders a colored tick (used on Best match) so the lead reads as
// chosen, not just first.
function SectionLabel({ children, count, accent }: { children: ReactNode; count?: number; accent?: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      {accent && (
        <span aria-hidden className="inline-block h-[18px] w-[3px] rounded-full" style={{ background: accent }} />
      )}
      <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
        {children}
      </h2>
      {typeof count === "number" && count > 0 && (
        <span className="text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {count} more
        </span>
      )}
    </div>
  );
}

function Tile({
  color,
  icon,
  label,
  count,
  onClick,
  lead = false,
}: {
  color: string;
  icon?: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
  /** The bento lead lane — spans both columns and runs as a wide, taller
   *  cell (icon + name side-by-side) so it reads as the hero of the grid. */
  lead?: boolean;
}) {
  const reduce = useReducedMotion();

  // Frosted/translucent fluid lane — a tint of the lane color washing into
  // a TRANSLUCENT elevated paper, with a backdrop blur so the PageBloom
  // glows through (fluid glass over the aurora, like the Saved doorways).
  // Layered edge + inner highlight + ambient elevation keep the "made"
  // depth; a hairline keeps the glass crisp on a busy backdrop.
  const surface = {
    background: `linear-gradient(155deg, color-mix(in srgb, ${color} 14%, color-mix(in srgb, var(--app-bg-elevated-solid) 60%, transparent)) 0%, color-mix(in srgb, var(--app-bg-elevated-solid) 60%, transparent) 64%)`,
    boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)",
  } as const;

  if (lead) {
    // Wide hero lane: icon stamp + name/count in a row, with a soft accent
    // glow beneath so it reads as the lead choice, not just a big square.
    return (
      <motion.button
        type="button"
        onClick={onClick}
        variants={tileItem}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className="group relative col-span-2 flex min-h-[88px] items-center gap-3.5 overflow-hidden rounded-[var(--app-radius-lg)] p-4 text-left backdrop-blur-xl"
        style={surface}
      >
        {icon && (
          <IconStamp accent={color} size="lg">
            {icon}
          </IconStamp>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[18px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {label}
          </span>
          {typeof count === "number" && (
            <span className="text-[13px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {count} place{count === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-active:translate-x-0.5" strokeWidth={2.25} style={{ color }} aria-hidden />
      </motion.button>
    );
  }

  // Standard frosted lane — colored mark, name, quiet count. No description,
  // no chevron: the grid reads as a confident set of glass doors.
  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={tileItem}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="group relative flex min-h-[88px] flex-col items-start justify-between gap-2.5 rounded-[var(--app-radius-lg)] p-3.5 text-left backdrop-blur-xl"
      style={surface}
    >
      {icon && (
        <IconStamp accent={color} size="md">
          {icon}
        </IconStamp>
      )}
      <span className="flex flex-col">
        <span className="text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          {label}
        </span>
        {typeof count === "number" && (
          <span className="text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {count} place{count === 1 ? "" : "s"}
          </span>
        )}
      </span>
    </motion.button>
  );
}
