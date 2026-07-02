"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import {
  Sparkles, MapPin, Navigation, Share2, RefreshCw, X, Clock,
  Wand2, Shuffle, ChevronDown, Plus, ChevronRight,
  User, Heart, Users, UsersRound, Luggage,
  Leaf, Zap, Drama, Footprints, UtensilsCrossed,
  BookOpen, Coffee, Wine, Trees, CloudRain, Sun, Compass,
  CloudSun, Sunset, SearchX, Pin, Check, Bookmark,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { Plan, PlanInputs, PlanAlternative, PlanSlotCategory } from "@/lib/integrations/planner";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { generatePlan, removeStop, stopAlternatives, stopSwapOptions, setStop, addStop, reshufflePlan } from "./actions";
import { formatDistance } from "@/lib/geo";
import BottomDrawer from "@/components/ui/BottomDrawer";
import { useFollowedSlugs } from "@/hooks/useFollows";
import type { PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import CategoryIcon from "@/components/place/CategoryIcon";

/**
 * PlanBuilder — the /plan workhorse.
 *
 * Redesigned around two states:
 *
 * 1. NO-PLAN (the empty / first-visit state)
 *    Opens with VIBE cards as the primary CTA — five cinematic
 *    color-graded tiles ("Easy / Active / Cultural / Outdoors /
 *    Food first") that pick the mood AND immediately build a plan
 *    in one tap. Below, a "Curated outings" preset rail keeps the
 *    8 popular combinations one tap away. At the bottom, a
 *    "Customize the details" link opens a Vaul drawer where power
 *    users can pick audience, duration, start window, and "near me"
 *    location. Casual user: 1 tap. Power user: 4 picks + tap.
 *
 * 2. HAS-PLAN
 *    The plan itself is the page. A hero card (title + narrative
 *    + stop-count + total minutes). Below, a cinematic numbered
 *    timeline of stops with photo banners, time + open chips, and
 *    inline Swap / Remove / Directions actions. A sticky action
 *    bar at the bottom of the page on mobile gives single-tap
 *    Shuffle / Build new / Share so the user is never hunting for
 *    the controls after they've scrolled through 5 stops.
 *
 * Mobile-first. Single column. Generous touch targets. Respects
 * prefers-reduced-motion. Uses Vaul for the customize drawer (the
 * native-feeling mobile pattern), navigator.share for sharing,
 * navigator.geolocation for "near me". All progressive — the page
 * works without any of those APIs.
 */

const AUDIENCES: { value: PlanInputs["audience"]; label: string; Icon: LucideIcon }[] = [
  { value: "solo", label: "Solo", Icon: User },
  { value: "date", label: "Date", Icon: Heart },
  { value: "family", label: "Family", Icon: Users },
  { value: "friends", label: "Friends", Icon: UsersRound },
  { value: "visitor", label: "Visitor", Icon: Luggage },
];

// Cinematic vibe cards — the new front-and-center CTA. Each carries
// its own color story so the picker reads as a mood board, not a
// filter row. The hex is the "mood color" — used for gradient
// backings, accent bands, and the active state.
const VIBES: {
  value: PlanInputs["vibe"];
  label: string;
  tagline: string;
  Icon: LucideIcon;
  color: string;
}[] = [
  { value: "easy",     label: "Easy",     tagline: "Wander, sit, sip.",      Icon: Leaf, color: "#859076" },
  { value: "active",   label: "Active",   tagline: "Move, climb, ride.",     Icon: Zap, color: "#C99632" },
  { value: "cultural", label: "Cultural", tagline: "Galleries, music, words.", Icon: Drama, color: "#7E2C6F" },
  { value: "outdoors", label: "Outdoors", tagline: "Trails, water, sky.",     Icon: Footprints, color: "#2E3B2C" },
  { value: "food",     label: "Food first", tagline: "Eat. Then everything else.", Icon: UtensilsCrossed, color: "#A03A22" },
];

type Preset = {
  id: string;
  Icon: LucideIcon;
  label: string;
  tagline: string;
  audience: PlanInputs["audience"];
  vibe: PlanInputs["vibe"];
  hours: PlanInputs["duration_hours"];
  start: StartMode;
  color: string;
};

const PRESETS: Preset[] = [
  { id: "library-date", Icon: BookOpen, label: "Library date", tagline: "Quiet, smart, charming.", audience: "date", vibe: "cultural", hours: 3, start: "afternoon", color: "#7E2C6F" },
  { id: "date-night", Icon: Heart, label: "Date night", tagline: "Dinner. Drinks. A walk.", audience: "date", vibe: "easy", hours: 4, start: "evening", color: "#A03A22" },
  { id: "first-date", Icon: Coffee, label: "First date", tagline: "Coffee, walk, dessert.", audience: "date", vibe: "easy", hours: 2, start: "afternoon", color: "#8B5A2B" },
  { id: "girls-night", Icon: Wine, label: "Girls' night", tagline: "Wine and somewhere fun.", audience: "friends", vibe: "food", hours: 4, start: "evening", color: "#7E1F1F" },
  { id: "family-sunday", Icon: Trees, label: "Family Sunday", tagline: "Park, ice cream, easy.", audience: "family", vibe: "easy", hours: 4, start: "afternoon", color: "#1E6B3A" },
  { id: "rainy-day", Icon: CloudRain, label: "Rainy day", tagline: "Museum, lunch, theater.", audience: "solo", vibe: "cultural", hours: 3, start: "afternoon", color: "#2F5470" },
  { id: "sunny-saturday", Icon: Sun, label: "Sunny Saturday", tagline: "Trail, lunch, winery.", audience: "friends", vibe: "outdoors", hours: 6, start: "afternoon", color: "#C99632" },
  { id: "showing-friends", Icon: Compass, label: "Out-of-town friends", tagline: "The highlight reel.", audience: "visitor", vibe: "cultural", hours: 6, start: "afternoon", color: "#2F5470" },
];

const DURATIONS: PlanInputs["duration_hours"][] = [2, 3, 4, 6];
type StartMode = "now" | "afternoon" | "evening";
const STARTS: { value: StartMode; label: string; Icon: LucideIcon }[] = [
  { value: "now", label: "Now", Icon: Clock },
  { value: "afternoon", label: "Afternoon", Icon: CloudSun },
  { value: "evening", label: "Evening", Icon: Sunset },
];

function startAtFor(mode: StartMode): string | undefined {
  if (mode === "now") return undefined;
  const d = new Date();
  d.setHours(mode === "afternoon" ? 14 : 18, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

const OPEN_LABEL: Record<Plan["stops"][number]["open"], { text: string; color: string }> = {
  open: { text: "Open", color: "var(--app-positive)" },
  likely: { text: "Likely open", color: "var(--app-warning)" },
  unknown: { text: "Hours unconfirmed", color: "var(--app-ink-3)" },
  closed: { text: "May be closed", color: "var(--app-warning)" },
};

export default function PlanBuilder({
  initialPlan,
  initialInputs,
  shared = false,
}: {
  initialPlan?: Plan;
  initialInputs?: Partial<PlanInputs>;
  shared?: boolean;
}) {
  const [audience, setAudience] = useState<PlanInputs["audience"]>(initialInputs?.audience ?? "date");
  const [vibe, setVibe] = useState<PlanInputs["vibe"]>(initialInputs?.vibe ?? "easy");
  const [hours, setHours] = useState<PlanInputs["duration_hours"]>(initialInputs?.duration_hours ?? 3);
  const [startMode, setStartMode] = useState<StartMode>("now");
  const [near, setNear] = useState<{ lng: number; lat: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(initialPlan ?? null);
  const [editing, setEditing] = useState(!shared);
  const [busy, setBusy] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── User agency (pick / add / pin) ──────────────────────────────
  // Pinned place slugs survive a Shuffle (which now re-rolls only the
  // unpinned stops). A place the user explicitly added is auto-pinned,
  // so Shuffle never discards a choice they made on purpose.
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  // Swap CHOOSER (vs the old blind swap): which stop is being chosen
  // for, and the real alternatives fetched for that slot.
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const [alts, setAlts] = useState<PlanAlternative[] | null>(null);
  // The category switcher inside the Swap chooser: what kinds this slot
  // could become, and which kind is currently selected.
  const [swapCats, setSwapCats] = useState<PlanSlotCategory[] | null>(null);
  const [swapCat, setSwapCat] = useState<string | null>(null);
  // Add-from-Saved drawer.
  const [addOpen, setAddOpen] = useState(false);
  const { slugs: savedSlugs } = useFollowedSlugs();
  // Hydrate saved places via the by-slugs API (NOT a static import of
  // places-client.json — that inlined the whole ~1.8MB dataset into /plan's
  // client bundle). Mirrors SavedList's pattern; ships only the saved rows.
  const savedKey = useMemo(() => [...savedSlugs].sort().join(","), [savedSlugs]);
  const [savedPlaces, setSavedPlaces] = useState<Map<string, PlaceCardData>>(new Map());
  useEffect(() => {
    if (savedSlugs.size === 0) return;
    const ctrl = new AbortController();
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(savedKey)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { places: PlaceCardData[] }) => {
        const m = new Map<string, PlaceCardData>();
        for (const p of data.places) m.set(p.slug, p);
        setSavedPlaces(m);
      })
      .catch((err) => {
        if (err && err.name !== "AbortError") setSavedPlaces(new Map());
      });
    return () => ctrl.abort();
  }, [savedKey, savedSlugs.size]);
  // Monotonic shuffle seed — advanced on each re-roll.
  const shuffleSeed = useRef(0);

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setNear({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      (err) =>
        setGeoMsg(
          err && err.code === 1
            ? "Location is off. Enable it to plan from where you are."
            : "Could not get your location. Using downtown Frederick.",
        ),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const onBuild = (overrides?: Partial<PlanInputs> & { seed?: number; start?: StartMode }) => {
    const usingStart = overrides?.start ?? startMode;
    startTransition(async () => {
      const result = await generatePlan({
        audience: overrides?.audience ?? audience,
        vibe: overrides?.vibe ?? vibe,
        duration_hours: overrides?.duration_hours ?? hours,
        start_at: startAtFor(usingStart),
        start_near: near ?? undefined,
        seed: overrides?.seed,
      });
      setPlan(result);
      setEditing(true);
      setDrawerOpen(false);
    });
  };

  /** One-tap VIBE card: set the vibe + immediately build with the
   *  current other settings. Smoothes the path for casual users. */
  const onVibeTap = (v: PlanInputs["vibe"]) => {
    setVibe(v);
    onBuild({ vibe: v });
  };

  /** Cycle helpers — let the user advance audience / duration /
   *  start by tapping the in-page "Planning for" chips instead of
   *  opening the Customize drawer. Each tap moves to the next
   *  option and loops; no build is triggered until the user taps a
   *  vibe card. Surfaces the assumptions before the vibe-tap
   *  generates a plan around them. */
  const cycleAudience = () => {
    const i = AUDIENCES.findIndex((a) => a.value === audience);
    setAudience(AUDIENCES[(i + 1) % AUDIENCES.length].value);
  };
  const cycleHours = () => {
    const i = DURATIONS.indexOf(hours);
    setHours(DURATIONS[(i + 1) % DURATIONS.length]);
  };
  const cycleStart = () => {
    const i = STARTS.findIndex((s) => s.value === startMode);
    setStartMode(STARTS[(i + 1) % STARTS.length].value);
  };
  const currentAudience = AUDIENCES.find((a) => a.value === audience) ?? AUDIENCES[0];
  const currentStart = STARTS.find((s) => s.value === startMode) ?? STARTS[0];

  // Shuffle now re-rolls only the UNPINNED stops, keeping anything the
  // user pinned or added — "pin what you love, shuffle the rest". With
  // nothing pinned it re-rolls the whole plan (the old behavior), but
  // spec-based so edits aren't silently discarded.
  const onShuffle = () => {
    if (!plan) return;
    const token = plan.share;
    // Monotonic seed — each shuffle advances it so the re-roll differs,
    // without an impure Math.random() in render scope.
    shuffleSeed.current += 1;
    mutate(() => reshufflePlan(token, [...pinned], shuffleSeed.current), null);
  };

  const onPreset = (p: Preset) => {
    setAudience(p.audience);
    setVibe(p.vibe);
    setHours(p.hours);
    setStartMode(p.start);
    onBuild({
      audience: p.audience,
      vibe: p.vibe,
      duration_hours: p.hours,
      start: p.start,
    });
  };

  const mutate = (fn: () => Promise<Plan | null>, idx: number | null) => {
    setBusy(idx);
    startTransition(async () => {
      const result = await fn();
      if (result) setPlan(result);
      setBusy(null);
    });
  };

  // Open the Swap chooser for a stop: fetch the kinds this slot could be
  // + the current kind's real alternatives, so the user picks what AND
  // what kind (vs. the blind "next").
  const openSwap = (idx: number) => {
    if (!plan) return;
    setSwapIdx(idx);
    setAlts(null);
    setSwapCats(null);
    setSwapCat(null);
    const token = plan.share;
    startTransition(async () => {
      const { categories, alternatives, selected } = await stopSwapOptions(token, idx);
      setSwapCats(categories);
      setSwapCat(selected);
      setAlts(alternatives);
    });
  };
  // Change WHAT KIND of stop this slot is, then show that kind's picks.
  const pickSwapCat = (cat: string) => {
    if (!plan || swapIdx === null) return;
    const token = plan.share;
    const idx = swapIdx;
    setSwapCat(cat);
    setAlts(null);
    startTransition(async () => {
      setAlts(await stopAlternatives(token, idx, cat));
    });
  };
  const chooseStop = (idx: number, slug: string) => {
    if (!plan) return;
    const token = plan.share;
    const oldSlug = plan.stops[idx]?.place?.slug;
    setSwapIdx(null);
    // If this slot was pinned, the pin follows the user's new choice (and
    // the now-absent old slug is dropped, so it can't haunt a later Shuffle).
    if (oldSlug && pinned.has(oldSlug)) {
      setPinned((cur) => {
        const next = new Set(cur);
        next.delete(oldSlug);
        next.add(slug);
        return next;
      });
    }
    mutate(() => setStop(token, idx, slug), idx);
  };
  const togglePin = (slug: string) => {
    setPinned((cur) => {
      const next = new Set(cur);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };
  const addFromSaved = (slug: string) => {
    if (!plan) return;
    const token = plan.share;
    setAddOpen(false);
    // A place the user added on purpose is pinned, so Shuffle keeps it.
    setPinned((cur) => new Set(cur).add(slug));
    mutate(() => addStop(token, slug), null);
  };

  // Saved places the user could drop in — resolvable, with a position,
  // not already in the plan.
  const inPlanSlugs = new Set(
    (plan?.stops ?? []).map((s) => s.place?.slug).filter(Boolean) as string[],
  );
  const savedCandidates = [...savedSlugs]
    .filter((s) => !inPlanSlugs.has(s))
    .map((s) => savedPlaces.get(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p && p.geom));

  const onShare = async () => {
    if (!plan) return;
    const url = `${window.location.origin}/plan?p=${plan.share}`;
    try {
      if (navigator.share) await navigator.share({ title: plan.title, text: plan.summary, url });
      else {
        await navigator.clipboard.writeText(url);
        setGeoMsg("Link copied. Paste it to share this plan.");
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const building = pending && busy === null;

  return (
    <div className="space-y-6 pb-24">
      {/* ── NO-PLAN — primary builder surface ──────────────── */}
      {!plan && (
        <>
          {/* HERO PROMPT */}
          <section className="space-y-2">
            <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              Pick a mood
            </p>
            <h2
              className="font-serif text-[22px] font-semibold leading-tight tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              What kind of night?
            </h2>
            <p className="text-[14px]" style={{ color: "var(--app-ink-3)" }}>
              Tap one to build a plan with that energy.
            </p>
          </section>

          {/* PLANNING FOR — three quick-cycle chips that surface the
              audience / duration / start assumptions BEFORE a vibe
              tap auto-builds against them. Tap a chip to advance to
              the next option; no build runs until the user picks a
              vibe. Previously these lived only inside the Customize
              drawer, so casual users were getting plans built with
              default assumptions they couldn't see. */}
          <section
            className="-mt-1 flex flex-wrap items-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-2"
            style={{ borderColor: "var(--app-border)" }}
            aria-label="Plan settings"
          >
            <span
              className="px-1 text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Planning for
            </span>
            <button
              type="button"
              onClick={cycleAudience}
              className="tactile-interactive inline-flex items-center gap-1 rounded-full border bg-[var(--app-bg-elevated)] px-2.5 py-1 text-[12px] font-semibold transition active:scale-[0.96]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
              aria-label={`Audience: ${currentAudience.label}. Tap to change.`}
            >
              <currentAudience.Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              {currentAudience.label}
            </button>
            <button
              type="button"
              onClick={cycleHours}
              className="tactile-interactive inline-flex items-center gap-1 rounded-full border bg-[var(--app-bg-elevated)] px-2.5 py-1 text-[12px] font-semibold transition active:scale-[0.96]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
              aria-label={`Duration: ${hours} hours. Tap to change.`}
            >
              <Clock className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              {hours} hr
            </button>
            <button
              type="button"
              onClick={cycleStart}
              className="tactile-interactive inline-flex items-center gap-1 rounded-full border bg-[var(--app-bg-elevated)] px-2.5 py-1 text-[12px] font-semibold transition active:scale-[0.96]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
              aria-label={`Start: ${currentStart.label}. Tap to change.`}
            >
              <currentStart.Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Starts {currentStart.label.toLowerCase()}
            </button>
          </section>

          {/* VIBE CARDS — the primary CTA. Cinematic color-graded
              tiles that pick a vibe AND build in one tap.
              Layout: scroll-snap rail on mobile (single touch-friendly
              row), grid on tablet+, and a full 5-across on desktop.
              That avoids the lone-last-card problem 2-col layouts have
              with an odd-count grid, and gives mobile users a swipe
              affordance the brief asked for. */}
          <div className="-mx-4 sm:mx-0">
            <ul
              className="shelf-rail gap-2.5 px-4 pb-1 sm:px-0 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5"
              aria-label="Pick a vibe to start"
            >
              {VIBES.map((v) => (
                <li
                  key={v.value}
                  className="aspect-[4/5] w-[44vw] max-w-[180px] shrink-0 snap-start sm:w-auto sm:max-w-none"
                >
                  <button
                    type="button"
                    onClick={() => onVibeTap(v.value)}
                    disabled={pending}
                    aria-pressed={vibe === v.value}
                    className="vibe-card group relative h-full w-full overflow-hidden rounded-[var(--app-radius-lg)] p-3.5 text-left transition active:scale-[0.985] disabled:opacity-70"
                    style={{
                      background: `linear-gradient(155deg, ${v.color} 0%, color-mix(in srgb, ${v.color} 65%, var(--app-bedrock)) 100%)`,
                      boxShadow: `0 12px 28px -10px ${v.color}, var(--app-elev-1)`,
                    }}
                  >
                    <v.Icon
                      aria-hidden
                      className="pointer-events-none absolute -bottom-5 -right-4 h-28 w-28 text-white transition-transform duration-300 group-hover:scale-105"
                      strokeWidth={1.5}
                      style={{ opacity: 0.22 }}
                    />
                    <div className="relative flex h-full flex-col">
                      <v.Icon aria-hidden className="h-6 w-6 text-white" strokeWidth={2.25} />
                      <span className="mt-auto block">
                        <span className="block font-serif text-[20px] font-semibold leading-tight tracking-tight text-white">
                          {v.label}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-white/80">
                          {v.tagline}
                        </span>
                      </span>
                    </div>
                    <span
                      aria-hidden
                      className="absolute inset-x-3 top-0 h-px"
                      style={{ background: "rgba(255,255,255,0.35)" }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* PRESET RAIL — curated outings, secondary CTA */}
          <section className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
                Curated outings
              </p>
              <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                The combos people search for
              </p>
            </div>
            <div className="-mx-4 px-4 sm:-mx-0 sm:px-0">
              <ul
                className="shelf-rail gap-2 pb-1"
                aria-label="Curated plan presets"
              >
                {PRESETS.map((p) => (
                  <li key={p.id} className="shrink-0 snap-start">
                    <button
                      type="button"
                      onClick={() => onPreset(p)}
                      disabled={pending}
                      className="tactile-interactive relative flex w-[170px] flex-col gap-1 overflow-hidden rounded-[var(--app-radius-md)] p-3 text-left transition active:scale-[0.985] disabled:opacity-70"
                      style={{
                        background: `linear-gradient(155deg, color-mix(in srgb, ${p.color} 22%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 100%)`,
                        border: `1px solid color-mix(in srgb, ${p.color} 30%, var(--app-border))`,
                        boxShadow: "var(--app-elev-1)",
                      }}
                    >
                      <p.Icon
                        aria-hidden
                        className="pointer-events-none absolute -bottom-4 -right-3 h-[72px] w-[72px]"
                        strokeWidth={1.5}
                        style={{ opacity: 0.16, color: p.color }}
                      />
                      <p.Icon aria-hidden className="relative h-[18px] w-[18px]" strokeWidth={2.25} style={{ color: p.color }} />
                      <span
                        className="relative font-serif text-[14px] font-semibold leading-tight tracking-tight"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {p.label}
                      </span>
                      <span
                        className="relative text-[11px] leading-snug"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {p.tagline}
                      </span>
                      <span
                        className="relative mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em]"
                        style={{ color: p.color }}
                      >
                        {p.hours}h · {p.start === "now" ? "now" : p.start}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* CUSTOMIZE DRAWER TRIGGER + LOCATION */}
          <section className="space-y-2.5">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="tactile tactile-interactive flex w-full items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-4 py-3.5 text-left"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-elevated)",
              }}
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                  style={{
                    background: "color-mix(in srgb, var(--app-cool) 12%, transparent)",
                    color: "var(--app-cool)",
                  }}
                >
                  <Wand2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
                <span className="flex flex-col">
                  <span
                    className="text-[14px] font-semibold leading-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    Customize the details
                  </span>
                  <span
                    className="text-[11px] leading-snug"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {currentSettingsLabel(audience, hours, startMode, near != null)}
                  </span>
                </span>
              </span>
              <ChevronDown
                className="h-4 w-4 shrink-0"
                strokeWidth={2.25}
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
            </button>

            {/* Primary build button — the always-on escape hatch even
                if the user doesn't tap a vibe. Uses current state. */}
            <button
              type="button"
              onClick={() => onBuild()}
              disabled={pending}
              className="tactile tactile-lift tactile-glow-brand group relative inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-70"
              style={{
                background:
                  "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 60%, var(--app-cool)))",
                transitionTimingFunction: "var(--app-ease-spring)",
              }}
            >
              <Sparkles
                className={`h-4 w-4 ${building ? "animate-spin" : "transition-transform group-hover:rotate-12"}`}
                strokeWidth={2.25}
                aria-hidden
              />
              {building ? "Stitching your night together…" : "Build my evening"}
            </button>
            {geoMsg && (
              <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {geoMsg}
              </p>
            )}
          </section>

          {/* Subtle honesty footer — sets expectations before any plan
              renders. */}
          <p
            className="flex items-start gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[12px] leading-relaxed"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <Sparkles
              className="mt-0.5 h-3 w-3 shrink-0"
              style={{ color: "var(--app-cool)" }}
              aria-hidden
            />
            <span>
              Every stop is a real, operational place in Frederick County,
              pulled from the directory, not invented. We respect your
              vibe + audience + time budget when stitching them together.
            </span>
          </p>
        </>
      )}

      {/* ── HAS-PLAN — the plan IS the page ──────────────── */}
      {plan && (
        <section className="space-y-4">
          {/* PLAN HERO */}
          <article
            className="tactile tactile-feature relative overflow-hidden rounded-[var(--app-radius-lg)] p-5"
            style={{
              background:
                "linear-gradient(155deg, color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 60%, color-mix(in srgb, var(--app-cool) 8%, var(--app-bg-elevated)) 100%)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-x-5 top-0 h-[3px] rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--app-brand), var(--app-cool))",
              }}
            />
            <p
              className="eyebrow inline-flex items-center gap-1.5"
              style={{ color: "var(--app-cool)" }}
            >
              <Sparkles className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              Your plan
            </p>
            <h2
              className="mt-1.5 font-serif text-[26px] font-semibold leading-[1.1] tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {plan.title}
            </h2>
            {plan.summary && (
              <p
                className="mt-1.5 text-[14px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                {plan.summary}
              </p>
            )}
            {plan.narrative && (
              <blockquote
                className="mt-3 border-l-2 pl-3 font-serif text-[15px] italic leading-relaxed"
                style={{
                  borderColor: "color-mix(in srgb, var(--app-brand) 50%, transparent)",
                  color: "var(--app-ink-2)",
                }}
              >
                {plan.narrative}
              </blockquote>
            )}
            {plan.stops.length > 0 && (
              <ul
                className="mt-3.5 flex flex-wrap items-center gap-1.5"
                aria-label="Plan summary"
              >
                <Meta>
                  <MapPin className="h-3 w-3" aria-hidden />
                  {plan.stops.length} {plan.stops.length === 1 ? "stop" : "stops"}
                </Meta>
                <Meta>
                  <Clock className="h-3 w-3" aria-hidden />
                  {totalMinutes(plan)} min total
                </Meta>
                {totalRadius(plan) > 0 && (
                  <Meta>
                    <Navigation className="h-3 w-3" aria-hidden />
                    {formatDistance(totalRadius(plan))} across
                  </Meta>
                )}
              </ul>
            )}
            {shared && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="tactile tactile-lift mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white"
                style={{
                  background:
                    "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 60%, var(--app-cool)))",
                }}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Make it your own
              </button>
            )}
          </article>

          {/* STOPS — cinematic numbered timeline */}
          {plan.stops.length === 0 ? (
            <div className="tactile flex flex-col items-center gap-2 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] px-6 py-10 text-center">
              <span
                aria-hidden
                className="grid h-12 w-12 place-items-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--app-brand) 12%, transparent)" }}
              >
                <SearchX className="h-6 w-6" strokeWidth={2} style={{ color: "var(--app-brand)" }} />
              </span>
              <p className="font-serif text-base font-semibold" style={{ color: "var(--app-ink)" }}>
                No clean match for that combo
              </p>
              <p className="max-w-xs text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                Try a different vibe, give it more time, or open Customize
                and tap &ldquo;Near me&rdquo; for a wider net.
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold"
                style={{
                  background: "var(--app-bg-sunken)",
                  color: "var(--app-ink-2)",
                }}
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
                Open Customize
              </button>
            </div>
          ) : (
            <ol
              className="reveal-up relative space-y-3 pl-10"
              aria-label="Plan stops, in order"
            >
              {/* The vertical thread between stop nodes — gradient
                  from brand at the top to cool at the bottom so the
                  timeline feels intentional, not like a CSS hairline. */}
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-4 left-[15px] top-4 w-[2px] rounded-full"
                style={{
                  background:
                    "linear-gradient(var(--app-brand), var(--app-cool))",
                  opacity: 0.55,
                }}
              />
              {plan.stops.map((stop, idx) => (
                <Stop
                  key={`${stop.order}-${idx}`}
                  stop={stop}
                  idx={idx}
                  busy={busy}
                  pending={pending}
                  editing={editing}
                  isPinned={stop.place ? pinned.has(stop.place.slug) : false}
                  onSwap={() => openSwap(idx)}
                  onPin={stop.place ? () => togglePin(stop.place!.slug) : undefined}
                  onRemove={() => mutate(() => removeStop(plan.share, idx), idx)}
                />
              ))}
              {/* Add a specific place the user wants — from their Saved
                  list — instead of only what the planner picked. */}
              {editing && (
                <li className="relative">
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    disabled={pending}
                    className="tactile tactile-interactive flex w-full items-center justify-center gap-1.5 rounded-[var(--app-radius-lg)] border border-dashed bg-[var(--app-bg-elevated)] px-3 py-3 text-[13px] font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    Add a stop you want
                  </button>
                </li>
              )}
            </ol>
          )}

          {/* HONESTY FOOTER */}
          {plan.stops.length > 0 && (
            <p
              className="flex items-start gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px] leading-relaxed"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              <Sparkles
                className="mt-0.5 h-3 w-3 shrink-0"
                style={{ color: "var(--app-cool)" }}
                aria-hidden
              />
              <span>
                Every stop is a real, operational place from our directory,
                nothing invented. Open hours are best-known; confirm
                before you go.
              </span>
            </p>
          )}

          {/* STICKY ACTION BAR (mobile) — keeps shuffle / new / share
              one tap away even after the user has scrolled past 5 stops. */}
          <div
            className="pointer-events-none fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-[var(--z-fab)] px-3 pb-3"
            // Sit ABOVE BottomNav (which is ~68-72px tall). Bumping
            // this with a translate keeps a clean stack on mobile.
            style={{ transform: "translateY(-64px)" }}
          >
            <div
              className="pointer-events-auto mx-auto flex max-w-md items-center gap-1.5 rounded-full border p-1 shadow-[var(--app-elev-3)]"
              style={{
                background: "color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent)",
                borderColor: "var(--app-border)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <BarAction
                onClick={onShuffle}
                icon={Shuffle}
                label="Shuffle"
                disabled={pending}
                busy={pending && busy === null}
              />
              <BarAction
                onClick={() => {
                  setPlan(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                icon={Plus}
                label="New plan"
                disabled={pending}
              />
              <BarAction
                onClick={onShare}
                icon={Share2}
                label="Share"
                primary
                disabled={pending}
              />
            </div>
          </div>
        </section>
      )}

      {/* ── Customize Drawer — Vaul ─────────────────────────────── */}
      <BottomDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Customize the details"
        subtitle="Pick who, how long, and when. We'll do the rest."
      >
        <div className="space-y-5 px-4 py-4">
          <Field label="Who you're with">
            <ChipRow>
              {AUDIENCES.map((a) => (
                <Chip
                  key={a.value}
                  active={a.value === audience}
                  onClick={() => setAudience(a.value)}
                  accent="brand"
                >
                  <a.Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />{" "}
                  {a.label}
                </Chip>
              ))}
            </ChipRow>
          </Field>
          <Field label="Vibe">
            <ChipRow>
              {VIBES.map((v) => (
                <Chip
                  key={v.value}
                  active={v.value === vibe}
                  onClick={() => setVibe(v.value)}
                  accent="cool"
                >
                  <v.Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />{" "}
                  {v.label}
                </Chip>
              ))}
            </ChipRow>
          </Field>
          <Field label="How long">
            <ChipRow>
              {DURATIONS.map((d) => (
                <Chip
                  key={d}
                  active={d === hours}
                  onClick={() => setHours(d)}
                  accent="cool"
                >
                  {d} hours
                </Chip>
              ))}
            </ChipRow>
          </Field>
          <Field label="Start">
            <ChipRow>
              {STARTS.map((s) => (
                <Chip
                  key={s.value}
                  active={s.value === startMode}
                  onClick={() => setStartMode(s.value)}
                  accent="cool"
                >
                  <s.Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />{" "}
                  {s.label}
                </Chip>
              ))}
              <Chip active={near != null} onClick={useMyLocation} accent="brand">
                <Navigation className="h-3.5 w-3.5" aria-hidden />{" "}
                {near ? "Your spot" : "Near me"}
              </Chip>
            </ChipRow>
            {geoMsg && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {geoMsg}
              </p>
            )}
          </Field>

          <button
            type="button"
            onClick={() => onBuild()}
            disabled={pending}
            className="tactile tactile-lift tactile-glow-brand group relative inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3.5 text-[15px] font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 60%, var(--app-cool)))",
            }}
          >
            <Sparkles
              className={`h-4 w-4 ${building ? "animate-spin" : "transition-transform group-hover:rotate-12"}`}
              strokeWidth={2.25}
              aria-hidden
            />
            {building ? "Stitching your night…" : "Build with these"}
          </button>
        </div>
      </BottomDrawer>

      {/* Swap chooser — instead of blindly cycling to the "next best",
          show the real alternatives for this slot and let the user pick. */}
      <BottomDrawer
        open={swapIdx !== null}
        onOpenChange={(o) => { if (!o) setSwapIdx(null); }}
        title="Swap this stop"
        subtitle="Change the kind, or pick another. These all fit the slot."
      >
        <div className="px-4 py-4">
          {/* Category switcher — make this slot a different KIND of stop
              (dessert instead of a bar), then pick the place. */}
          {swapCats && swapCats.length > 1 && (
            <div className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-1.5">
                {swapCats.map((c) => {
                  const cc = CATEGORY_BY_SLUG[c.category]?.color ?? "var(--app-brand)";
                  const active = c.category === swapCat;
                  return (
                    <button
                      key={c.category}
                      type="button"
                      disabled={pending}
                      onClick={() => pickSwapCat(c.category)}
                      aria-pressed={active}
                      className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                      style={{
                        background: active ? cc : "var(--app-bg-sunken)",
                        color: active ? "#fff" : "var(--app-ink-2)",
                      }}
                    >
                      <CategoryIcon
                        slug={c.category}
                        className="h-3.5 w-3.5"
                        strokeWidth={2.25}
                        style={{ color: active ? "#fff" : cc }}
                      />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {alts === null ? (
            <ul className="space-y-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="h-[64px] animate-pulse rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)]"
                />
              ))}
            </ul>
          ) : alts.length === 0 ? (
            <p className="py-6 text-center text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              No other good fits for this slot right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {alts.map((a) => {
                const cat = CATEGORY_BY_SLUG[a.category];
                const catColor = cat?.color ?? "var(--app-brand)";
                return (
                  <li key={a.slug}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => swapIdx !== null && chooseStop(swapIdx, a.slug)}
                      className="tactile tactile-interactive flex w-full items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-left disabled:opacity-50"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <span
                        aria-hidden
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                        style={{ background: `color-mix(in srgb, ${catColor} 16%, transparent)` }}
                      >
                        <CategoryIcon slug={a.category} className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: catColor }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block font-serif text-[15px] font-semibold leading-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {a.name}
                        </span>
                        <span
                          className="mt-0.5 block truncate text-[12px] leading-tight"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {a.why || a.categoryName}
                        </span>
                      </span>
                      <Check className="h-4 w-4 shrink-0" style={{ color: catColor }} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </BottomDrawer>

      {/* Add-a-stop — pull a place the user already saved into the plan,
          so they're building the night, not just accepting it. */}
      <BottomDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add a stop you want"
        subtitle="Drop in a place you've saved. We'll fit it into the night."
      >
        <div className="px-4 py-4">
          {savedCandidates.length === 0 ? (
            <div className="py-6 text-center">
              <Bookmark className="mx-auto h-6 w-6" style={{ color: "var(--app-ink-3)" }} aria-hidden />
              <p className="mt-2 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                {savedSlugs.size === 0
                  ? "Save places you love and they'll show up here to add."
                  : "Everything you've saved is already in this plan."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {savedCandidates.map((p) => {
                const cat = CATEGORY_BY_SLUG[p.category];
                const catColor = cat?.color ?? "var(--app-brand)";
                return (
                  <li key={p.slug}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => addFromSaved(p.slug)}
                      className="tactile tactile-interactive flex w-full items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-left disabled:opacity-50"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <span
                        aria-hidden
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                        style={{ background: `color-mix(in srgb, ${catColor} 16%, transparent)` }}
                      >
                        <CategoryIcon slug={p.category} className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: catColor }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block font-serif text-[15px] font-semibold leading-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {p.name}
                        </span>
                        <span
                          className="mt-0.5 block truncate text-[12px] leading-tight"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {cat?.name ?? p.category}
                        </span>
                      </span>
                      <Plus className="h-4 w-4 shrink-0" style={{ color: catColor }} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </BottomDrawer>
    </div>
  );
}

/* ───────────────────────── Subcomponents ───────────────────────── */

function Stop({
  stop, idx, busy, pending, editing, isPinned, onSwap, onPin, onRemove,
}: {
  stop: Plan["stops"][number];
  idx: number;
  busy: number | null;
  pending: boolean;
  editing: boolean;
  isPinned: boolean;
  onSwap: () => void;
  onPin?: () => void;
  onRemove: () => void;
}) {
  const href = stop.place ? `/places/${stop.place.slug}` : stop.event ? `/events/${stop.event.slug}` : "#";
  const name = stop.place?.name ?? stop.event?.title ?? "";
  const where = stop.place
    ? `${stop.place.address}, ${stop.place.city}`
    : stop.event?.venue_name ?? "";
  const geom = stop.place?.geom ?? stop.event?.geom;
  const ol = OPEN_LABEL[stop.open];
  // Make the KIND of stop explicit — a labeled category mark in the
  // category's own color. Place stops only; events read by their time.
  const placeCat = stop.place?.category;
  const catMeta = placeCat ? CATEGORY_BY_SLUG[placeCat] : undefined;
  const catColor = catMeta?.color ?? "var(--app-cool)";

  return (
    <li className="relative">
      <span
        className="absolute -left-10 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-full font-serif text-sm font-bold text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 55%, var(--app-cool)))",
          boxShadow: "var(--app-elev-2), 0 0 0 4px var(--app-bg)",
        }}
        aria-hidden
      >
        {stop.order}
      </span>
      <article className="tactile tactile-interactive overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]">
        {stop.photo_url && (
          <div className="relative h-36 w-full overflow-hidden bg-[var(--app-bg-sunken)]">
            <Image
              src={stop.photo_url}
              alt=""
              fill
              sizes="(max-width: 720px) 100vw, 720px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover transition-transform duration-300 hover:scale-105"
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 60%, transparent 100%)",
              }}
            />
            <span
              className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold tabular-nums shadow-[var(--app-elev-1)]"
              style={{ color: "var(--app-cool)" }}
            >
              <Clock className="h-3 w-3" aria-hidden />
              {clock(stop.at)} · {stop.duration_min} min
            </span>
            <span
              className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold shadow-[var(--app-elev-1)]"
              style={{ color: "var(--app-ink)" }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: ol.color }}
                aria-hidden
              />
              {ol.text}
            </span>
            {/* Title overlay on photo — reads cinematic without
                covering the image. */}
            <Link
              href={href}
              className="absolute inset-x-0 bottom-0 block p-3 group"
            >
              <h3 className="font-serif text-[18px] font-semibold leading-tight tracking-tight text-white drop-shadow-md group-hover:underline">
                {name}
              </h3>
              {where && (
                <p className="mt-0.5 truncate text-[12px] text-white/85">
                  <MapPin className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
                  {where}
                </p>
              )}
            </Link>
          </div>
        )}
        <div className="p-4">
          {!stop.photo_url && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
                  style={{
                    background: "color-mix(in srgb, var(--app-cool) 12%, transparent)",
                    color: "var(--app-cool)",
                  }}
                >
                  <Clock className="h-3 w-3" aria-hidden />
                  {clock(stop.at)} · {stop.duration_min} min
                </span>
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
                  style={{ color: "var(--app-ink)" }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: ol.color }}
                    aria-hidden
                  />
                  {ol.text}
                </span>
              </div>
              <Link href={href} className="group mt-2 block">
                <h3
                  className="font-serif text-[18px] font-semibold leading-snug tracking-tight transition-colors group-hover:underline"
                  style={{ color: "var(--app-ink)" }}
                >
                  {name}
                </h3>
                {where && (
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    <MapPin className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
                    {where}
                  </p>
                )}
              </Link>
            </>
          )}
          {placeCat && catMeta && (
            <div className="mt-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]"
                style={{
                  background: `color-mix(in srgb, ${catColor} 13%, transparent)`,
                  color: catColor,
                }}
              >
                <CategoryIcon slug={placeCat} className="h-3 w-3" strokeWidth={2.25} />
                {catMeta.name}
              </span>
            </div>
          )}
          <p
            className="mt-2 text-[14px] leading-relaxed text-pretty"
            style={{ color: "var(--app-ink-2)" }}
          >
            {stop.why}
          </p>
          {/* The verified Field Note for this stop — parking intel first. No
              other app's plan tells you where to park at each stop; render it
              as the quiet expert margin note it is, never a badge. */}
          {stop.tip && (
            <p
              className="mt-2 border-l-2 pl-2.5 text-[12px] leading-relaxed"
              style={{ borderColor: "var(--app-brand-2)", color: "var(--app-ink-2)" }}
            >
              {stop.tip}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {geom && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${geom.lat},${geom.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-44-y tactile tactile-interactive inline-flex items-center gap-1 rounded-full bg-[var(--app-bg-sunken)] px-3 py-1.5 text-[11px] font-semibold"
                style={{ color: "var(--app-ink-2)" }}
              >
                <Navigation className="h-3 w-3" aria-hidden />
                Directions
              </a>
            )}
            <Link
              href={href}
              className="tap-44-y tactile tactile-interactive inline-flex items-center gap-1 rounded-full bg-[var(--app-bg-sunken)] px-3 py-1.5 text-[11px] font-semibold"
              style={{ color: "var(--app-ink-2)" }}
            >
              Details
              <ChevronRight className="h-3 w-3" aria-hidden />
            </Link>
            {editing && stop.place && (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={onSwap}
                  className="tap-44-y tactile tactile-interactive inline-flex items-center gap-1 rounded-full bg-[var(--app-bg-sunken)] px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  <RefreshCw
                    className={`h-3 w-3 ${busy === idx ? "animate-spin" : ""}`}
                    aria-hidden
                  />
                  Swap
                </button>
                {onPin && (
                  <button
                    type="button"
                    onClick={onPin}
                    disabled={pending}
                    aria-pressed={isPinned}
                    className="tap-44-y tactile tactile-interactive inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                    style={{
                      background: isPinned ? "var(--app-cool)" : "var(--app-bg-sunken)",
                      color: isPinned ? "#fff" : "var(--app-ink-2)",
                    }}
                  >
                    <Pin className="h-3 w-3" strokeWidth={2.25} fill={isPinned ? "currentColor" : "none"} aria-hidden />
                    {isPinned ? "Pinned" : "Pin"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={onRemove}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--app-bg-sunken)] disabled:opacity-50"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  <X className="h-3 w-3" aria-hidden />
                  Remove
                </button>
              </>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Chip({
  active, accent = "brand", onClick, children,
}: {
  active: boolean;
  accent?: "brand" | "cool";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const accentColor = accent === "cool" ? "var(--app-cool)" : "var(--app-brand)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition active:scale-[0.94]"
      style={{
        borderColor: active ? accentColor : "var(--app-border)",
        background: active ? accentColor : "var(--app-bg-elevated)",
        color: active ? "white" : "var(--app-ink-2)",
        boxShadow: active ? "var(--app-elev-2)" : "var(--app-elev-1)",
        transitionTimingFunction: "var(--app-ease-spring)",
      }}
    >
      {children}
    </button>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <li
      className="inline-flex items-center gap-1.5 rounded-full bg-white/55 px-2.5 py-1 text-[11px] font-semibold tabular-nums"
      style={{ color: "var(--app-ink-2)" }}
    >
      {children}
    </li>
  );
}

function BarAction({
  onClick, icon: Icon, label, primary, disabled, busy,
}: {
  onClick: () => void;
  icon: typeof Shuffle;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition active:scale-[0.96] disabled:opacity-50"
      style={
        primary
          ? {
              background:
                "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 60%, var(--app-cool)))",
              color: "white",
              boxShadow: "var(--app-brand-glow)",
            }
          : {
              background: "transparent",
              color: "var(--app-ink-2)",
            }
      }
    >
      <Icon
        className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
        strokeWidth={2.25}
        aria-hidden
      />
      {label}
    </button>
  );
}

/* ───────────────────────── Helpers ───────────────────────── */

function currentSettingsLabel(
  audience: PlanInputs["audience"],
  hours: PlanInputs["duration_hours"],
  start: StartMode,
  hasLocation: boolean,
): string {
  const aud = AUDIENCES.find((a) => a.value === audience)?.label ?? audience;
  const startLabel = STARTS.find((s) => s.value === start)?.label ?? start;
  const loc = hasLocation ? " · Near me" : "";
  return `${aud} · ${hours}h · ${startLabel}${loc}`;
}

function totalMinutes(plan: Plan): number {
  return plan.stops.reduce((sum, s) => sum + (s.duration_min ?? 0), 0);
}

function totalRadius(plan: Plan): number {
  let max = 0;
  let baseLng: number | null = null;
  let baseLat: number | null = null;
  for (const s of plan.stops) {
    const g = s.place?.geom ?? s.event?.geom;
    if (!g) continue;
    if (baseLng === null) {
      baseLng = g.lng;
      baseLat = g.lat;
      continue;
    }
    const dLng =
      (g.lng - baseLng) * 111320 * Math.cos(((baseLat ?? 0) * Math.PI) / 180);
    const dLat = (g.lat - (baseLat ?? 0)) * 111320;
    max = Math.max(max, Math.sqrt(dLng * dLng + dLat * dLat));
  }
  return max;
}
