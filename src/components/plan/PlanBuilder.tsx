"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CloudRain,
  Footprints,
  Leaf,
  LocateFixed,
  MapPin,
  Navigation,
  Pin,
  Plus,
  RefreshCw,
  Route,
  Share2,
  SlidersHorizontal,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import BottomDrawer from "@/components/ui/BottomDrawer";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { formatDistance } from "@/lib/geo";
import type { PlaceCardData } from "@/lib/loaders/places";
import type {
  Plan,
  PlanAlternative,
  PlanInputs,
  PlanSlotCategory,
} from "@/lib/integrations/planner";
import { useFollowedSlugs } from "@/hooks/useFollows";
import {
  addStop,
  generatePlan,
  removeStop,
  setStop,
  stopAlternatives,
  stopSwapOptions,
} from "./actions";

type StartMode = "now" | "afternoon" | "evening" | "custom";

const AUDIENCES: Array<{
  value: PlanInputs["audience"];
  label: string;
}> = [
  { value: "solo", label: "Solo" },
  { value: "date", label: "A date" },
  { value: "family", label: "Family" },
  { value: "friends", label: "Friends" },
  { value: "visitor", label: "Visitors" },
];

const VIBES: Array<{
  value: PlanInputs["vibe"];
  label: string;
}> = [
  { value: "easy", label: "Keep it easy" },
  { value: "food", label: "Food first" },
  { value: "cultural", label: "Arts & history" },
  { value: "outdoors", label: "Be outside" },
  { value: "active", label: "Stay moving" },
];

const DURATIONS: PlanInputs["duration_hours"][] = [2, 3, 4, 6];

const OPEN_LABEL: Record<Plan["stops"][number]["open"], { text: string; color: string }> = {
  open: { text: "Open for this stop", color: "var(--app-positive)" },
  likely: { text: "Likely open", color: "var(--app-warning)" },
  unknown: { text: "Hours unconfirmed", color: "var(--app-ink-3)" },
  closed: { text: "Closed at this time", color: "var(--app-negative)" },
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
  const [startMode, setStartMode] = useState<StartMode>(initialInputs?.start_at ? "custom" : "now");
  const [customStart, setCustomStart] = useState(() => toLocalInput(initialInputs?.start_at));
  const [area, setArea] = useState(() => {
    if (!initialInputs) return "frederick";
    return initialInputs.municipality ?? "county";
  });
  const [near, setNear] = useState<{ lng: number; lat: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(initialPlan ?? null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const [alts, setAlts] = useState<PlanAlternative[] | null>(null);
  const [swapCats, setSwapCats] = useState<PlanSlotCategory[] | null>(null);
  const [swapCat, setSwapCat] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { slugs: savedSlugs } = useFollowedSlugs();
  const savedKey = useMemo(() => [...savedSlugs].sort().join(","), [savedSlugs]);
  const [savedPlaces, setSavedPlaces] = useState<Map<string, PlaceCardData>>(new Map());

  useEffect(() => {
    if (savedSlugs.size === 0) {
      setSavedPlaces(new Map());
      return;
    }
    const controller = new AbortController();
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(savedKey)}`, {
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((data: { places: PlaceCardData[] }) => {
        setSavedPlaces(new Map(data.places.map((place) => [place.slug, place])));
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setSavedPlaces(new Map());
      });
    return () => controller.abort();
  }, [savedKey, savedSlugs.size]);

  const selectedTown = area !== "county" && area !== "near"
    ? MUNICIPALITIES.find((town) => town.slug === area)
    : undefined;

  const areaLabel = area === "near"
    ? "Near your location"
    : area === "county"
      ? "Frederick County"
      : selectedTown?.name ?? "Frederick";

  const requestMyLocation = () => {
    setErrorMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMsg("Location is not available in this browser.");
      return;
    }
    setGeoMsg("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNear({ lng: position.coords.longitude, lat: position.coords.latitude });
        setArea("near");
        setGeoMsg("The route will start near your current location. Your coordinates will not be added to the share link.");
      },
      (error) => {
        setGeoMsg(error?.code === 1
          ? "Location is off. Choose an area or allow location access."
          : "Radius could not get your location. Choose an area instead.");
      },
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  };

  const handleAreaChange = (nextArea: string) => {
    if (nextArea === "near") {
      if (near) setArea("near");
      else requestMyLocation();
      return;
    }
    setArea(nextArea);
    setNear(null);
    setGeoMsg(null);
  };

  const buildInputs = (): PlanInputs | null => {
    const startAt = startAtFor(startMode, customStart);
    if (!startAt) {
      setErrorMsg("Choose a valid date and time before building the plan.");
      return null;
    }
    return {
      audience,
      vibe,
      duration_hours: hours,
      start_at: startAt,
      ...(selectedTown ? {
        municipality: selectedTown.slug,
        start_near: selectedTown.centroid,
      } : {}),
      ...(area === "county" ? { max_distance_m: 60_000 } : {}),
      ...(area === "near" && near ? { start_near: near, max_distance_m: 16_000 } : {}),
    };
  };

  const onBuild = () => {
    const inputs = buildInputs();
    if (!inputs) return;
    setErrorMsg(null);
    setStatusMsg("Building a route that fits those choices…");
    startTransition(async () => {
      try {
        const result = await generatePlan(inputs);
        if (!result) throw new Error("No plan returned");
        setPlan(result);
        setDrawerOpen(false);
        setStatusMsg(result.stops.length > 0
          ? `Built a ${result.stops.length}-stop plan for ${areaLabel}.`
          : "No open route fit those choices.");
        replacePlanUrl(result.share);
        window.setTimeout(() => resultRef.current?.focus(), 50);
      } catch {
        setErrorMsg("Radius could not build this plan. Please try again.");
        setStatusMsg(null);
      }
    });
  };

  const mutate = (work: () => Promise<Plan | null>, index: number | null, success: string) => {
    setBusy(index);
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result) throw new Error("No updated plan returned");
        setPlan(result);
        setStatusMsg(success);
        replacePlanUrl(result.share);
      } catch {
        setErrorMsg("That change did not go through. Your current plan is still here.");
      } finally {
        setBusy(null);
      }
    });
  };

  const openSwap = (index: number) => {
    if (!plan) return;
    setSwapIdx(index);
    setAlts(null);
    setSwapCats(null);
    setSwapCat(null);
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const options = await stopSwapOptions(plan.share, index);
        setSwapCats(options.categories);
        setSwapCat(options.selected);
        setAlts(options.alternatives);
      } catch {
        setAlts([]);
        setErrorMsg("Radius could not load other stops right now.");
      }
    });
  };

  const pickSwapCategory = (category: string) => {
    if (!plan || swapIdx === null) return;
    setSwapCat(category);
    setAlts(null);
    startTransition(async () => {
      try {
        setAlts(await stopAlternatives(plan.share, swapIdx, category));
      } catch {
        setAlts([]);
      }
    });
  };

  const chooseStop = (index: number, slug: string) => {
    if (!plan) return;
    const oldSlug = plan.stops[index]?.place?.slug;
    if (oldSlug && pinned.has(oldSlug)) {
      setPinned((current) => {
        const next = new Set(current);
        next.delete(oldSlug);
        next.add(slug);
        return next;
      });
    }
    setSwapIdx(null);
    mutate(() => setStop(plan.share, index, slug), index, "That stop has been changed.");
  };

  const togglePin = (slug: string) => {
    setPinned((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const inPlan = new Set((plan?.stops ?? []).flatMap((stop) => stop.place ? [stop.place.slug] : []));
  const savedCandidates = [...savedSlugs]
    .filter((slug) => !inPlan.has(slug))
    .map((slug) => savedPlaces.get(slug))
    .filter((place): place is PlaceCardData => Boolean(place?.geom));

  const addFromSaved = (slug: string) => {
    if (!plan) return;
    setAddOpen(false);
    setPinned((current) => new Set(current).add(slug));
    mutate(() => addStop(plan.share, slug), null, "Your saved place has been added.");
  };

  const onShare = async () => {
    if (!plan) return;
    const url = `${window.location.origin}/plan?p=${plan.share}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: plan.title, text: plan.summary, url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatusMsg("The plan link is copied.");
      }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        setErrorMsg("Radius could not share this plan. Please copy the page address instead.");
      }
    }
  };

  const startOver = () => {
    setPlan(null);
    setStatusMsg(null);
    setErrorMsg(null);
    window.history.replaceState(null, "", "/plan");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const controls = (
    <PlannerFields
      area={area}
      onAreaChange={handleAreaChange}
      onUseLocation={requestMyLocation}
      geoMsg={geoMsg}
      startMode={startMode}
      onStartModeChange={setStartMode}
      customStart={customStart}
      onCustomStartChange={setCustomStart}
      audience={audience}
      onAudienceChange={setAudience}
      vibe={vibe}
      onVibeChange={setVibe}
      hours={hours}
      onHoursChange={setHours}
    />
  );

  return (
    <div className="mx-auto max-w-3xl pb-8">
      {!plan && (
        <section
          className="tactile rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 sm:p-5"
          style={{ borderColor: "var(--app-border)" }}
        >
          {controls}
          <button
            type="button"
            onClick={onBuild}
            disabled={pending}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 text-[15px] font-semibold text-white transition sm:mt-6 active:scale-[0.99] disabled:opacity-65"
            style={{ background: "var(--app-brand-press)", boxShadow: "var(--app-brand-glow)" }}
          >
            <Route className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            {pending ? "Building your route…" : "Build my plan"}
          </button>
          <Message status={statusMsg} error={errorMsg} />
        </section>
      )}

      {plan && (
        <section ref={resultRef} tabIndex={-1} className="space-y-4 outline-none" style={{ outline: "none" }}>
          <article
            className="tactile rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 sm:p-5"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow" style={{ color: "var(--app-brand)" }}>
                  {shared ? "Shared plan · " : ""}{planDateLabel(plan)} · {areaLabel}
                </p>
                {shared ? (
                  <h1 className="mt-1 font-serif text-[28px] font-semibold leading-[1.08] tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {plan.title}
                  </h1>
                ) : (
                  <h2 className="mt-1 font-serif text-[28px] font-semibold leading-[1.08] tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {plan.title}
                  </h2>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                Adjust
              </button>
            </div>

            {plan.summary && (
              <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {plan.summary}
              </p>
            )}
            {plan.weather_note && (
              <p className="mt-3 flex items-start gap-2 rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)] p-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                <CloudRain className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
                {plan.weather_note}
              </p>
            )}

            {plan.stops.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Plan summary">
                <Meta><Clock className="h-3.5 w-3.5" aria-hidden />{planWindowLabel(plan)}</Meta>
                <Meta><MapPin className="h-3.5 w-3.5" aria-hidden />{plan.stops.length} {plan.stops.length === 1 ? "stop" : "stops"}</Meta>
                {totalRouteDistance(plan) > 0 && (
                  <Meta><Route className="h-3.5 w-3.5" aria-hidden />{formatDistance(totalRouteDistance(plan))} between stops</Meta>
                )}
              </ul>
            )}

            {plan.stops.length > 0 && (
              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <a
                  href={routeUrlForPlan(plan)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 text-[14px] font-semibold text-white"
                  style={{ background: "var(--app-brand-press)" }}
                >
                  <Navigation className="h-4 w-4" aria-hidden />
                  Open full route
                </a>
                <button
                  type="button"
                  onClick={onShare}
                  className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[var(--app-radius-md)] border px-3"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                  aria-label="Share this plan"
                >
                  <Share2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}
          </article>

          {plan.stops.length === 0 ? (
            <div className="rounded-[var(--app-radius-lg)] border border-dashed p-6 text-center" style={{ borderColor: "var(--app-border)" }}>
              <AlertCircle className="mx-auto h-6 w-6" style={{ color: "var(--app-brand)" }} aria-hidden />
              <h3 className="mt-2 font-serif text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>
                Nothing reliable fits yet.
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                Radius did not find enough places with confirmed hours for that area and time. Try an earlier start, a longer drive, or another kind of outing.
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Change the plan
              </button>
            </div>
          ) : (
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-6 left-[15px] top-6 w-px"
                style={{ background: "var(--app-border-strong)" }}
              />
              <ol className="space-y-3 pl-10" aria-label="Plan stops, in order">
                {plan.stops.map((stop, index) => (
                  <Stop
                    key={`${stop.order}-${stop.place?.slug ?? stop.event?.slug ?? index}`}
                    stop={stop}
                    index={index}
                    pending={pending}
                    busy={busy}
                    pinned={stop.place ? pinned.has(stop.place.slug) : false}
                    onSwap={stop.place ? () => openSwap(index) : undefined}
                    onPin={stop.place ? () => togglePin(stop.place!.slug) : undefined}
                    onRemove={() => mutate(() => removeStop(plan.share, index), index, "The stop has been removed.")}
                  />
                ))}
                {savedCandidates.length > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setAddOpen(true)}
                      disabled={pending}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] border border-dashed px-3 text-[13px] font-semibold disabled:opacity-50"
                      style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Add a saved place
                    </button>
                  </li>
                )}
              </ol>
            </div>
          )}

          <div className={`grid gap-2 ${plan.stops.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
            {plan.stops.length > 0 && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border px-3 text-[13px] font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Change settings
              </button>
            )}
            <button
              type="button"
              onClick={startOver}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border px-3 text-[13px] font-semibold"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Start another
            </button>
          </div>
          <Message status={statusMsg} error={errorMsg} />
        </section>
      )}

      <BottomDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Adjust the plan"
        subtitle="Change the area, time, company, or focus. Your current route stays until you rebuild it."
      >
        <div className="space-y-5 px-4 py-4">
          {controls}
          <button
            type="button"
            onClick={onBuild}
            disabled={pending}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 text-[15px] font-semibold text-white disabled:opacity-65"
            style={{ background: "var(--app-brand-press)" }}
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
            {pending ? "Rebuilding…" : "Update this plan"}
          </button>
          <Message status={statusMsg} error={errorMsg} />
        </div>
      </BottomDrawer>

      <BottomDrawer
        open={swapIdx !== null}
        onOpenChange={(open) => { if (!open) setSwapIdx(null); }}
        title="Change this stop"
        subtitle="Choose another place that fits the route."
      >
        <div className="space-y-3 px-4 py-4">
          {swapCats && swapCats.length > 1 && (
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2">
                {swapCats.map((category) => (
                  <button
                    key={category.category}
                    type="button"
                    onClick={() => pickSwapCategory(category.category)}
                    disabled={pending}
                    aria-pressed={swapCat === category.category}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-[12px] font-semibold"
                    style={{
                      borderColor: swapCat === category.category ? "var(--app-cool)" : "var(--app-border)",
                      background: swapCat === category.category ? "var(--app-cool)" : "var(--app-bg-elevated)",
                      color: swapCat === category.category ? "white" : "var(--app-ink-2)",
                    }}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {alts === null ? (
            <ul className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((item) => <li key={item} className="h-16 animate-pulse rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)]" />)}
            </ul>
          ) : alts.length === 0 ? (
            <p className="py-6 text-center text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              No other open places fit this slot right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {alts.map((alternative) => {
                const category = CATEGORY_BY_SLUG[alternative.category];
                const color = category?.color ?? "var(--app-cool)";
                return (
                  <li key={alternative.slug}>
                    <button
                      type="button"
                      onClick={() => swapIdx !== null && chooseStop(swapIdx, alternative.slug)}
                      disabled={pending}
                      className="flex min-h-16 w-full items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-left disabled:opacity-50"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                        <CategoryIcon slug={alternative.category} className="h-[18px] w-[18px]" style={{ color }} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-serif text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>{alternative.name}</span>
                        <span className="mt-0.5 block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>{alternative.categoryName}</span>
                      </span>
                      <Check className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </BottomDrawer>

      <BottomDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add a saved place"
        subtitle="Choose one of your saved places to add to this route."
      >
        <div className="px-4 py-4">
          {savedCandidates.length === 0 ? (
            <p className="py-6 text-center text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              Save a place first, then it will appear here.
            </p>
          ) : (
            <ul className="space-y-2">
              {savedCandidates.map((place) => (
                <li key={place.slug}>
                  <button
                    type="button"
                    onClick={() => addFromSaved(place.slug)}
                    disabled={pending}
                    className="flex min-h-16 w-full items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-left disabled:opacity-50"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <Bookmark className="h-4 w-4 shrink-0" style={{ color: "var(--app-brand)" }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>{place.name}</span>
                      <span className="mt-0.5 block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>{CATEGORY_BY_SLUG[place.category]?.name ?? place.category}</span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </BottomDrawer>
    </div>
  );
}

function PlannerFields({
  area,
  onAreaChange,
  onUseLocation,
  geoMsg,
  startMode,
  onStartModeChange,
  customStart,
  onCustomStartChange,
  audience,
  onAudienceChange,
  vibe,
  onVibeChange,
  hours,
  onHoursChange,
}: {
  area: string;
  onAreaChange: (value: string) => void;
  onUseLocation: () => void;
  geoMsg: string | null;
  startMode: StartMode;
  onStartModeChange: (value: StartMode) => void;
  customStart: string;
  onCustomStartChange: (value: string) => void;
  audience: PlanInputs["audience"];
  onAudienceChange: (value: PlanInputs["audience"]) => void;
  vibe: PlanInputs["vibe"];
  onVibeChange: (value: PlanInputs["vibe"]) => void;
  hours: PlanInputs["duration_hours"];
  onHoursChange: (value: PlanInputs["duration_hours"]) => void;
}) {
  const audienceLabel = AUDIENCES.find((option) => option.value === audience)?.label ?? "A date";
  const vibeLabel = VIBES.find((option) => option.value === vibe)?.label ?? "Keep it easy";

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)" }}>
        <PickerRow label="Area" Icon={MapPin} action={
          <div className="flex min-w-0 items-center gap-1">
            <select
              value={area}
              onChange={(event) => onAreaChange(event.target.value)}
              className="min-h-11 min-w-0 flex-1 appearance-none bg-transparent text-right text-[13px] font-semibold outline-none rounded-[6px] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ color: "var(--app-ink)" }}
              aria-label="Planning area"
            >
              <option value="county">Countywide</option>
              {area === "near" && <option value="near">Near me</option>}
              {MUNICIPALITIES.map((town) => (
                <option key={town.slug} value={town.slug}>
                  {town.slug === "frederick" ? "Frederick" : town.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onUseLocation}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{ background: area === "near" ? "var(--app-brand)" : "var(--app-bg-sunken)", color: area === "near" ? "white" : "var(--app-ink-2)" }}
              aria-label="Use my current location"
              aria-pressed={area === "near"}
            >
              <LocateFixed className="h-4 w-4" aria-hidden />
            </button>
          </div>
        } />
        {geoMsg && <p className="px-3 pb-3 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>{geoMsg}</p>}

        <PickerRow label="Start" Icon={CalendarDays} controlId="plan-start" action={
          <select
            id="plan-start"
            value={startMode}
            onChange={(event) => onStartModeChange(event.target.value as StartMode)}
            className="min-h-11 min-w-0 appearance-none bg-transparent text-right text-[13px] font-semibold outline-none rounded-[6px] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
            style={{ color: "var(--app-ink)" }}
            aria-label="Start time"
          >
            {(["now", "afternoon", "evening", "custom"] as StartMode[]).map((mode) => (
              <option key={mode} value={mode}>{startModeLabel(mode)}</option>
            ))}
          </select>
        } />
        {startMode === "custom" && (
          <div className="px-3 pb-3">
            <input
              type="datetime-local"
              value={customStart}
              onChange={(event) => onCustomStartChange(event.target.value)}
              className="min-h-11 w-full rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated)] px-3 text-[13px]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
              aria-label="Custom start date and time in Frederick"
            />
          </div>
        )}
      </div>

      <details className="group overflow-hidden rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)" }}>
        <summary className="flex min-h-[54px] cursor-pointer list-none items-center gap-3 px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)] [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>Fine-tune the outing</span>
            <span className="mt-0.5 block truncate text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
              {audienceLabel} · {vibeLabel} · {hours} hours
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" style={{ color: "var(--app-ink-3)" }} aria-hidden />
        </summary>
        <div className="divide-y border-t" style={{ borderColor: "var(--app-border)" }}>
          <PickerRow label="Going with" Icon={UsersRound} controlId="plan-audience" action={
            <select
              id="plan-audience"
              value={audience}
              onChange={(event) => onAudienceChange(event.target.value as PlanInputs["audience"])}
              className="min-h-11 min-w-0 appearance-none bg-transparent text-right text-[13px] font-semibold outline-none rounded-[6px] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ color: "var(--app-ink)" }}
              aria-label="Who is going"
            >
              {AUDIENCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          } />

          <PickerRow label="Focus" Icon={Leaf} controlId="plan-focus" action={
            <select
              id="plan-focus"
              value={vibe}
              onChange={(event) => onVibeChange(event.target.value as PlanInputs["vibe"])}
              className="min-h-11 min-w-0 appearance-none bg-transparent text-right text-[13px] font-semibold outline-none rounded-[6px] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ color: "var(--app-ink)" }}
              aria-label="What matters most"
            >
              {VIBES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          } />

          <PickerRow label="Time available" Icon={Clock} controlId="plan-duration" action={
            <select
              id="plan-duration"
              value={hours}
              onChange={(event) => onHoursChange(Number(event.target.value) as PlanInputs["duration_hours"])}
              className="min-h-11 min-w-0 appearance-none bg-transparent text-right text-[13px] font-semibold outline-none rounded-[6px] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ color: "var(--app-ink)" }}
              aria-label="Time available"
            >
              {DURATIONS.map((duration) => <option key={duration} value={duration}>{duration} hours</option>)}
            </select>
          } />
        </div>
      </details>
    </div>
  );
}

function PickerRow({
  label,
  Icon,
  action,
  controlId,
}: {
  label: string;
  Icon: LucideIcon;
  action: React.ReactNode;
  controlId?: string;
}) {
  const content = (
    <>
      <span className="inline-flex min-w-0 shrink-0 items-center gap-2 text-[13px] font-medium" style={{ color: "var(--app-ink-2)" }}>
        <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
        {label}
      </span>
      {controlId ? (
        <span className="min-w-0 flex-1 text-right">{action}</span>
      ) : (
        <div className="min-w-0 flex-1 text-right">{action}</div>
      )}
      <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--app-ink-3)" }} aria-hidden />
    </>
  );
  const className = "flex min-h-[52px] items-center gap-3 px-3 sm:min-h-14";

  if (controlId) {
    return (
      <label htmlFor={controlId} className={`${className} cursor-pointer`}>
        {content}
      </label>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}

function Stop({
  stop,
  index,
  pending,
  busy,
  pinned,
  onSwap,
  onPin,
  onRemove,
}: {
  stop: Plan["stops"][number];
  index: number;
  pending: boolean;
  busy: number | null;
  pinned: boolean;
  onSwap?: () => void;
  onPin?: () => void;
  onRemove: () => void;
}) {
  const href = stop.place ? `/places/${stop.place.slug}` : stop.event ? `/events/${stop.event.slug}` : "#";
  const name = stop.place?.name ?? stop.event?.title ?? "Stop";
  const where = stop.place ? placeLocationLabel(stop.place.address, stop.place.city) : stop.event?.venue_name;
  const geom = stop.place?.geom ?? stop.event?.geom;
  const status = OPEN_LABEL[stop.open];

  return (
    <li className="relative">
      {stop.travel_from_previous_min && (
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
          {stop.travel_mode === "walk" ? <Footprints className="h-3.5 w-3.5" aria-hidden /> : <Navigation className="h-3.5 w-3.5" aria-hidden />}
          About {stop.travel_from_previous_min} min {stop.travel_mode === "walk" ? "on foot" : "by car"}
          {stop.travel_from_previous_m ? ` · ${formatDistance(stop.travel_from_previous_m)}` : ""}
        </p>
      )}
      <span
        className="absolute -left-10 top-3 z-10 grid h-8 w-8 place-items-center rounded-full font-serif text-[13px] font-bold text-white"
        style={{ background: "var(--app-brand)", boxShadow: "0 0 0 4px var(--app-bg)" }}
        aria-hidden
      >
        {stop.order}
      </span>
      <article className="tactile rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold">
              <span className="tabular-nums" style={{ color: "var(--app-cool)" }}>{clock(stop.at)} · {stop.duration_min} min</span>
              <span className="inline-flex items-center gap-1" style={{ color: "var(--app-ink-2)" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} aria-hidden />
                {status.text}
              </span>
            </div>
            <Link href={href} className="group mt-1.5 block">
              <h3 className="font-serif text-[19px] font-semibold leading-tight tracking-tight group-hover:underline" style={{ color: "var(--app-ink)" }}>
                {name}
              </h3>
              {where && (
                <p className="mt-1 line-clamp-2 text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                  <MapPin className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
                  {where}
                </p>
              )}
            </Link>
          </div>
          {stop.photo_url && (
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)]">
              <Image
                src={stop.photo_url}
                alt=""
                fill
                unoptimized={stop.photo_url.startsWith("/api/place-photo")}
                sizes="80px"
                placeholder="blur"
                blurDataURL={PAPER_CREAM_BLUR}
                className="object-cover"
              />
            </div>
          )}
        </div>

        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{stop.why}</p>

        {stop.tip && (
          <details className="mt-2 rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)] px-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
              Parking and arrival note
            </summary>
            <p className="mb-3 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>{stop.tip}</p>
          </details>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {geom && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${geom.lat},${geom.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--app-bg-sunken)] px-3 text-[12px] font-semibold"
              style={{ color: "var(--app-ink-2)" }}
            >
              <Navigation className="h-3.5 w-3.5" aria-hidden />
              Directions
            </a>
          )}
          <Link
            href={href}
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[var(--app-bg-sunken)] px-3 text-[12px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            Details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          {onSwap && (
            <button
              type="button"
              onClick={onSwap}
              disabled={pending}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--app-bg-sunken)] px-3 text-[12px] font-semibold disabled:opacity-50"
              style={{ color: "var(--app-ink-2)" }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy === index ? "animate-spin" : ""}`} aria-hidden />
              Change
            </button>
          )}
          {onPin && (
            <button
              type="button"
              onClick={onPin}
              disabled={pending}
              aria-pressed={pinned}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold disabled:opacity-50"
              style={{ background: pinned ? "var(--app-cool)" : "var(--app-bg-sunken)", color: pinned ? "white" : "var(--app-ink-2)" }}
            >
              <Pin className="h-3.5 w-3.5" fill={pinned ? "currentColor" : "none"} aria-hidden />
              {pinned ? "Pinned" : "Pin"}
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium disabled:opacity-50"
            style={{ color: "var(--app-ink-3)" }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Remove
          </button>
        </div>
      </article>
    </li>
  );
}

function Message({ status, error }: { status: string | null; error: string | null }) {
  if (!status && !error) return null;
  return (
    <p
      className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed"
      style={{ color: error ? "var(--app-negative)" : "var(--app-ink-3)" }}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      {error && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
      {error ?? status}
    </p>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <li className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--app-bg-sunken)] px-2.5 text-[11px] font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}>
      {children}
    </li>
  );
}

function startModeLabel(mode: StartMode): string {
  if (mode === "now") return "Now";
  if (mode === "afternoon" || mode === "evening") {
    const hour = mode === "afternoon" ? 14 : 18;
    const target = nextFrederickTime(hour);
    const today = frederickDateKey(new Date());
    const day = frederickDateKey(target) === today ? "Today" : "Tomorrow";
    return `${day} at ${mode === "afternoon" ? "2 PM" : "6 PM"}`;
  }
  return "Pick a time";
}

function startAtFor(mode: StartMode, customStart: string): string | null {
  if (mode === "now") return new Date().toISOString();
  if (mode === "custom") return frederickLocalToIso(customStart);
  return nextFrederickTime(mode === "afternoon" ? 14 : 18).toISOString();
}

function toLocalInput(value?: string): string {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  const parts = frederickParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function frederickParts(date: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<"year" | "month" | "day" | "hour" | "minute", string>;
}

function frederickDateKey(date: Date): string {
  const parts = frederickParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function frederickLocalToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let instant = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = frederickParts(new Date(instant));
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    instant += target - represented;
  }
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
}

function nextFrederickTime(hour: number): Date {
  const now = new Date();
  const today = frederickDateKey(now);
  let candidate = new Date(frederickLocalToIso(`${today}T${String(hour).padStart(2, "0")}:00`) ?? now.toISOString());
  if (candidate.getTime() <= now.getTime()) {
    const [year, month, day] = today.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
    const key = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
    candidate = new Date(frederickLocalToIso(`${key}T${String(hour).padStart(2, "0")}:00`) ?? now.toISOString());
  }
  return candidate;
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function planDateLabel(plan: Plan): string {
  if (plan.stops.length === 0) return "Your plan";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(plan.stops[0].at));
}

function planWindowLabel(plan: Plan): string {
  if (plan.stops.length === 0) return "No time set";
  const first = plan.stops[0];
  const last = plan.stops[plan.stops.length - 1];
  const end = new Date(new Date(last.at).getTime() + last.duration_min * 60_000).toISOString();
  return `${clock(first.at)}–${clock(end)}`;
}

function totalRouteDistance(plan: Plan): number {
  return plan.stops.reduce((sum, stop) => sum + (stop.travel_from_previous_m ?? 0), 0);
}

function routeUrlForPlan(plan: Plan): string {
  const points = plan.stops
    .map((stop) => stop.place?.geom ?? stop.event?.geom)
    .filter((point): point is { lat: number; lng: number } => Boolean(point));
  if (points.length === 0) return "https://www.google.com/maps";
  const destination = points[points.length - 1];
  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.lat},${destination.lng}`,
    travelmode: plan.stops.some((stop) => stop.travel_mode === "drive") ? "driving" : "walking",
  });
  if (points.length > 1) {
    params.set("waypoints", points.slice(0, -1).map((point) => `${point.lat},${point.lng}`).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function replacePlanUrl(token: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `/plan?p=${encodeURIComponent(token)}`);
}

function placeLocationLabel(address?: string, city?: string): string {
  const cleanAddress = address?.trim();
  const cleanCity = city?.trim();
  if (!cleanAddress) return cleanCity ?? "";
  if (!cleanCity || cleanAddress.toLowerCase() === cleanCity.toLowerCase()) return cleanAddress;
  return `${cleanAddress}, ${cleanCity}`;
}
