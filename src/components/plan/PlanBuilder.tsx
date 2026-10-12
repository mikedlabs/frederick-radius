"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties } from "react";
import {
  AlertCircle,
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
import { useSearchParams } from "next/navigation";
import BottomDrawer from "@/components/ui/BottomDrawer";
import { PlaceMedallion } from "@/components/place/PlaceMedallion";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import { formatDistance } from "@/lib/geo";
import type { PlaceCardData } from "@/lib/loaders/places";
import type {
  Plan,
  PlanAlternative,
  PlanInputs,
  PlanSlotCategory,
} from "@/lib/integrations/planner";
import { useFollowedSlugs } from "@/hooks/useFollows";
import PlanStopPhoto from "./PlanStopPhoto";
import PlanStopsMap from "./PlanStopsMap";
import { revealPlan } from "./plan-motion";
import { rebuildPlanInputs, planConstraintLabels, planDistanceForArea } from "./plan-inputs";
import { checkPlanBeforeVisit } from "./visit-check-action";
import type { PlanVisitCheck } from "@/lib/plan/visit-check";
import styles from "./PlanBuilder.module.css";
import { decodeSpec } from "@/lib/plan/plan-token";
import SaveOutingButton from "@/components/saved/SaveOutingButton";
import { updatedPlanHref } from "@/lib/plan-journey";
import { isDestinationCategory, isRecommendable } from "@/lib/relevance";
import { withBrowseReturnTo } from "@/lib/browse-return";
import {
  addStop,
  planFromToken,
  generatePlan,
  regeneratePinnedPlan,
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

const subscribePlanReadiness = () => () => {};

export default function PlanBuilder({
  initialPlan,
  initialInputs,
  shared = false,
  fromPlace,
}: {
  initialPlan?: Plan;
  initialInputs?: Partial<PlanInputs>;
  shared?: boolean;
  fromPlace?: string;
}) {
  const searchParams = useSearchParams();
  // A visible server preview must not invite a tap before its handlers exist.
  const controlsReady = useSyncExternalStore(subscribePlanReadiness, () => true, () => false);
  const [audience, setAudience] = useState<PlanInputs["audience"]>(initialInputs?.audience ?? "date");
  const [vibe, setVibe] = useState<PlanInputs["vibe"]>(initialInputs?.vibe ?? "easy");
  const [hours, setHours] = useState<PlanInputs["duration_hours"]>(initialInputs?.duration_hours ?? 3);
  const [verifiedHoursOnly, setVerifiedHoursOnly] = useState(() => {
    const sharedInputs = initialPlan ? decodeSpec(initialPlan.share)?.i : null;
    if (sharedInputs) return sharedInputs.require_verified_hours ?? Boolean(sharedInputs.start_at);
    return initialInputs?.require_verified_hours ?? false;
  });
  const [startMode, setStartMode] = useState<StartMode>(initialInputs?.start_at ? "custom" : "now");
  const [customStart, setCustomStart] = useState(() => toLocalInput(initialInputs?.start_at));
  const [area, setArea] = useState(() => {
    if (!initialInputs) return "county";
    return initialInputs.municipality ?? "county";
  });
  const [planArea, setPlanArea] = useState(initialInputs?.municipality ?? "county");
  const [near, setNear] = useState<{ lng: number; lat: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(initialPlan ?? null);
  const [planMunicipality, setPlanMunicipality] = useState(initialInputs?.municipality);
  const [planAreaLabel, setPlanAreaLabel] = useState(() => initialInputs?.municipality
    ? MUNICIPALITIES.find((town) => town.slug === initialInputs.municipality)?.name ?? "Frederick County"
    : "Frederick County");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const [visitCheck, setVisitCheck] = useState<PlanVisitCheck | null>(null);
  const [checkClock, setCheckClock] = useState(0);
  const [startedNew, setStartedNew] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const locationRequest = useRef(0);
  useEffect(() => () => { locationRequest.current += 1; }, []);

  const [pinned, setPinned] = useState<Set<string>>(() => new Set(initialInputs?.anchor_slug ? [initialInputs.anchor_slug] : []));
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
    const request = ++locationRequest.current;
    setGeoMsg("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== locationRequest.current) return;
        setNear({ lng: position.coords.longitude, lat: position.coords.latitude });
        setArea("near");
        setGeoMsg("The route will start near your current location. Your coordinates will not be added to the share link.");
      },
      (error) => {
        if (request !== locationRequest.current) return;
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
    locationRequest.current += 1;
    setArea(nextArea);
    setNear(null);
    setGeoMsg(null);
  };

  const currentSpec = plan ? decodeSpec(plan.share) : null;
  const inputContext = { currentSpec, initialInputs: startedNew ? { ...initialInputs, anchor_slug: undefined, event_anchor_slug: undefined } : initialInputs };
  const constraintLabels = planConstraintLabels(inputContext);
  const activeEventAnchor = currentSpec?.i.event_anchor_slug;
  const scheduledEventStop = plan?.stops.find((stop) => stop.event);

  const buildInputs = (): PlanInputs | null => {
    const startAt = startAtFor(startMode, customStart);
    if (!startAt) {
      setErrorMsg("Choose a valid date and time before building the plan.");
      return null;
    }
    return { ...rebuildPlanInputs({
      audience, vibe, duration_hours: hours, start_at: startAt,
      ...(selectedTown ? { municipality: selectedTown.slug, start_near: selectedTown.centroid } : {}),
      max_distance_m: planDistanceForArea(area, planArea, inputContext),
      ...(area === "near" && near ? { start_near: near } : {}),
    }, inputContext), require_verified_hours: verifiedHoursOnly };
  };

  const onBuild = () => {
    const inputs = buildInputs();
    if (!inputs) return;
    setErrorMsg(null);
    setStatusMsg("Building a route that fits those choices…");
    startTransition(async () => {
      try {
        const selectedPins = [...pinned].filter((slug) => currentSpec?.s.some((ref) => "p" in ref && ref.p === slug));
        const result = plan && selectedPins.length > 0
          ? await regeneratePinnedPlan(plan.share, inputs, selectedPins)
          : await generatePlan(inputs);
        if (!result) throw new Error("No plan returned");
        await revealPlan(() => {
          setPlan(result);
          setPinned((previous) => pinsInPlan(previous, result));
          setVisitCheck(null);
          if (inputs.event_anchor_slug) {
            const resolved = decodeSpec(result.share)?.i;
            if (resolved) { setHours(resolved.duration_hours); setCustomStart(toLocalInput(resolved.start_at)); setStartMode("custom"); }
          }
          setPlanArea(area);
          setPlanMunicipality(inputs.municipality);
          setPlanAreaLabel(areaLabel);
          setDrawerOpen(false);
          setStatusMsg(result.stops.length > 0
            ? `Built a ${result.stops.length}-stop plan for ${areaLabel}.`
            : inputs.require_verified_hours
              ? "Radius could not confirm venue hours for this outing."
              : "No stops fit those choices yet.");
          replacePlanUrl(result.share);
        });
        window.setTimeout(() => resultRef.current?.focus(), 50);
      } catch {
        setErrorMsg("Radius could not build this plan. Please try again.");
        setStatusMsg(null);
      }
    });
  };

  const mutate = (work: () => Promise<Plan | null>, index: number | null, success: string, onSuccess?: () => void) => {
    setBusy(index);
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result) throw new Error("No updated plan returned");
        setPlan(result);
        setPinned((previous) => pinsInPlan(previous, result));
        setVisitCheck(null);
        onSuccess?.();
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
    const oldSlug = plan.stops.find((stop, displayIndex) => (stop.spec_index ?? displayIndex) === index)?.place?.slug;
    setSwapIdx(null);
    mutate(() => setStop(plan.share, index, slug), index, "That stop has been changed.", () => {
      if (oldSlug && pinned.has(oldSlug)) setPinned((current) => {
        const next = new Set(current); next.delete(oldSlug); next.add(slug); return next;
      });
    });
  };

  const togglePin = (slug: string) => {
    setPinned((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const inPlan = new Set([...(plan?.stops ?? []).flatMap((stop) => stop.place ? [stop.place.slug] : []), ...(plan?.unscheduled ?? []).map((option) => option.place.slug)]);
  const planReturnTo = plan
    ? updatedPlanHref(new URL(`/plan?${searchParams}`, "https://frederick-radius.invalid"), plan.share)
    : undefined;
  const savedCandidates = [...savedSlugs]
    .filter((slug) => !inPlan.has(slug))
    .map((slug) => savedPlaces.get(slug))
    .filter((place): place is PlaceCardData => Boolean(place?.geom))
    .filter((place) => (!planMunicipality || place.municipality === planMunicipality)
      && isDestinationCategory(place.category) && isRecommendable(place)
      && place.is_operational !== "closed_permanently");

  const addFromSaved = (slug: string) => {
    if (!plan) return;
    setAddOpen(false);
    mutate(() => addStop(plan.share, slug), null, "Your saved place has been added.", () => setPinned((current) => new Set(current).add(slug)));
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
    if (pending) return;
    setPlan(null);
    setVisitCheck(null);
    setPinned(new Set());
    setStartedNew(true);
    locationRequest.current += 1;
    setGeoMsg(null);
    setStartMode("now");
    setCustomStart("");
    setStatusMsg(null);
    setErrorMsg(null);
    window.history.replaceState(null, "", updatedPlanHref(new URL(window.location.href)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const checkBeforeVisit = () => {
    if (!plan || pending) return;
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const result = await checkPlanBeforeVisit(plan.share);
        if (!result) throw new Error("Plan check unavailable");
        setPlan(result.plan);
        setPinned((previous) => pinsInPlan(previous, result.plan));
        setVisitCheck(result.briefing);
        setCheckClock(Date.now());
        setStatusMsg("The plan check is ready. Review the sources before setting out.");
      } catch {
        setErrorMsg("Radius could not check this plan. Your choices are still here. Please try again.");
      }
    });
  };

  useEffect(() => {
    if (!visitCheck) return;
    const timer = window.setInterval(() => setCheckClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [visitCheck]);
  const checkExpired = Boolean(visitCheck?.validUntil && Date.parse(visitCheck.validUntil) <= checkClock);

  const controls = (
    <fieldset disabled={pending || !controlsReady} aria-busy={!controlsReady || pending} className="disabled:opacity-65">
    <PlannerFields
      eventStart={activeEventAnchor ? scheduledEventStop?.at ?? initialInputs?.start_at ?? "" : undefined}
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
      verifiedHoursOnly={verifiedHoursOnly}
      onVerifiedHoursOnlyChange={setVerifiedHoursOnly}
    />
    </fieldset>
  );

  return (
    <div className={styles.builder} data-plan-controls-ready={controlsReady ? "true" : "false"}>
      {!plan && (
        <div className={styles.startLayout}>
        <PlanScene />
        <section
          className="tactile rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 sm:p-5"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="mb-4 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>Choose an area and a start time. Your outing can include places you have saved.</p>
          {controls}
          <button
            type="button"
            onClick={onBuild}
            disabled={pending || !controlsReady}
            className={`${styles.buildAction} mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 text-[15px] font-semibold text-white transition sm:mt-6 active:scale-[0.99] disabled:opacity-65`}
            style={{ background: "var(--app-brand-press)", boxShadow: "var(--app-brand-glow)" }}
          >
            <Route className={`h-4 w-4 ${pending ? styles.routeWorking : ""}`} strokeWidth={2.25} aria-hidden />
            {pending ? "Building your route…" : "Build my plan"}
          </button>
          <Message status={statusMsg} error={errorMsg} />
        </section>
        </div>
      )}

      {plan && (
        <section ref={resultRef} tabIndex={-1} className={`${styles.results} outline-none`} style={{ outline: "none" }}>
          <div className={styles.resultHeader}>
          <PlanScene compact />
          <article
            className={styles.overview}
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow" style={{ color: "var(--app-link)" }}>
                  {shared ? "Shared plan · " : ""}{planDateLabel(plan)} · {planAreaLabel}
                </p>
                <h1 className="mt-1 font-semibold" style={{ color: "var(--app-ink)" }}>{plan.title}</h1>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                disabled={pending || !controlsReady}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                Adjust
              </button>
            </div>

            {fromPlace && !plan.summary && plan.stops.some((stop) => stop.place?.slug === initialInputs?.anchor_slug) && (
              <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {fromPlace} is your first stop. Add saved places below or adjust the plan.
              </p>
            )}

            {scheduledEventStop && (
              <p className="mt-3 rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)] p-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                The event keeps its published start and full duration. Any nearby stop comes after it. Hours that Radius cannot confirm stay outside the timed route.
              </p>
            )}

            {plan.summary && (
              <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {plan.summary}
              </p>
            )}
            {constraintLabels.length > 0 && <ul className={styles.preferences} aria-label="Plan requirements">{constraintLabels.map((label) => <li key={label}>{label}</li>)}</ul>}
            {plan.weather_note && (
              <p className="mt-3 flex items-start gap-2 rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)] p-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                <CloudRain className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
                {plan.weather_note}
              </p>
            )}

            {plan.stops.some((stop) => stop.place && stop.open !== "open") && (
              <p className="mt-3 rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)] p-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Draft outing. These times are suggestions. Confirm each venue’s hours before setting out.
              </p>
            )}

            {plan.stops.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Plan summary">
                <Meta><Clock className="h-3.5 w-3.5" aria-hidden />{planWindowLabel(plan)}</Meta>
                <Meta><MapPin className="h-3.5 w-3.5" aria-hidden />{plan.stops.length} {plan.stops.length === 1 ? "stop" : "stops"}</Meta>
              </ul>
            )}

            <div className={`mt-4 grid items-start gap-2 ${plan.stops.length > 0 ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"}`}>
                <SaveOutingButton key={plan.share} token={plan.share} title={plan.title} disabled={pending || !controlsReady} />
                {plan.stops.length > 0 && <a
                  href={routeUrlForPlan(plan)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-[var(--app-radius-md)] border px-2"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-link)" }}
                  aria-label="Open full route"
                  title="Open full route"
                >
                  <Navigation className="h-4 w-4" aria-hidden />
                  <span className="text-[12px] font-semibold leading-tight">Route</span>
                </a>}
                <button
                  type="button"
                  onClick={onShare}
                  disabled={!controlsReady}
                  className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[var(--app-radius-md)] border px-3"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                  aria-label="Share this plan"
                >
                  <Share2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
          </article>
          </div>


          {Boolean(plan.notices?.length) && (
            <section data-event-plan-controls-ready={controlsReady ? "true" : "false"} aria-busy={!controlsReady || pending} className="space-y-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4" aria-label="Plan updates" style={{ borderColor: "var(--app-border)" }}>
              <h2 className="text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>Review your saved choices</h2>
              {plan.notices!.map((notice) => (
                <div key={`${notice.spec_index}-${notice.code}`} className="space-y-2">
                  <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{notice.message}</p>
                  <div className="flex flex-wrap gap-2">
                    {notice.event_href && <Link href={withBrowseReturnTo(notice.event_href, planReturnTo)} className="inline-flex min-h-11 items-center rounded-full bg-[var(--app-bg-sunken)] px-3 text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }}>Review event details</Link>}
                    <button type="button" disabled={!controlsReady || pending} onClick={() => mutate(() => removeStop(plan.share, notice.spec_index), notice.spec_index, "The saved reference has been removed.")} className="inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-semibold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>Remove saved reference</button>
                  </div>
                </div>
              ))}
              {plan.notices!.some((notice) => notice.code === "unavailable") && <button type="button" disabled={!controlsReady || pending} onClick={() => mutate(() => planFromToken(plan.share), null, "Your saved choices have been checked again.")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--app-bg-sunken)] px-3 text-[13px] font-semibold disabled:opacity-50" style={{ color: "var(--app-brand-press)" }}><RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />Check saved choices again</button>}
            </section>
          )}

          {Boolean(plan.unscheduled?.length) && (
            <section className="space-y-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4" aria-label="Choices to review" style={{ borderColor: "var(--app-border)" }}>
              <h2 className="text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>Choices to review</h2>
              {plan.unscheduled!.map((option) => <article key={option.place.slug}>
                <Link href={withBrowseReturnTo(`/places/${option.place.slug}`, planReturnTo)} className="text-[16px] font-semibold underline decoration-[var(--app-border-strong)] underline-offset-4" style={{ color: "var(--app-ink)" }}>{option.place.name}</Link>
                <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--app-ink-3)" }}>This choice is outside the timed route.</p>
                <p className="mt-1 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{option.why}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={!controlsReady || pending} onClick={() => openSwap(option.spec_index)} className="inline-flex min-h-11 items-center rounded-full bg-[var(--app-bg-sunken)] px-3 text-[13px] font-semibold disabled:opacity-50" style={{ color: "var(--app-ink-2)" }}>Change this choice</button>
                  <button type="button" disabled={!controlsReady || pending} onClick={() => mutate(() => removeStop(plan.share, option.spec_index), option.spec_index, "The nearby option has been removed.")} className="inline-flex min-h-11 items-center rounded-full bg-[var(--app-bg-sunken)] px-3 text-[13px] font-semibold disabled:opacity-50" style={{ color: "var(--app-ink-2)" }}>Remove this choice</button>
                </div>
              </article>)}
            </section>
          )}

          {plan.stops.length === 0 ? (
            <div className="rounded-[var(--app-radius-lg)] border border-dashed p-6 text-center" style={{ borderColor: "var(--app-border)" }}>
              <AlertCircle className="mx-auto h-6 w-6" style={{ color: "var(--app-brand)" }} aria-hidden />
              <h3 className="mt-2 font-serif text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>
                {plan.notices?.length ? "No stops are scheduled in this plan yet." : "Nothing reliable fits yet."}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                {plan.notices?.length
                  ? "Review the updates above or check the saved choices again. Your shared link still keeps the choices you made."
                  : (currentSpec?.i.require_verified_hours ?? Boolean(currentSpec?.i.start_at))
                    ? "Radius could not confirm venue hours for this outing. Choose Adjust, open Fine-tune the outing, and turn off confirmed hours only to build a draft. Check venue hours before setting out."
                    : "No stops fit this outing yet. Try another area, start time, or focus."}
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                disabled={pending || !controlsReady}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Change the plan
              </button>
            </div>
          ) : (
            <div className="relative">
              <ol className={`${styles.stopList} pl-10`} style={plan.stops.length === 1 ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined} aria-label="Plan stops, in order">
                {plan.stops.map((stop, index) => (
                  <Stop
                    key={`${stop.order}-${stop.place?.slug ?? stop.event?.slug ?? index}`}
                    stop={stop}
                    returnTo={planReturnTo}
                    index={stop.spec_index ?? index}
                    pending={pending || !controlsReady}
                    busy={busy}
                    pinned={stop.place ? pinned.has(stop.place.slug) : false}
                    onSwap={stop.place ? () => openSwap(stop.spec_index ?? index) : undefined}
                    onPin={stop.place ? () => togglePin(stop.place!.slug) : undefined}
                    onRemove={() => mutate(() => removeStop(plan.share, stop.spec_index ?? index), stop.spec_index ?? index, "The stop has been removed.")}
                  />
                ))}
                {savedCandidates.length > 0 && (!activeEventAnchor || inPlan.size === 0) && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setAddOpen(true)}
                      disabled={pending || !controlsReady}
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

          <section className={styles.visitCheck} aria-label="Check before you go">
            <div className={styles.visitHeader}>
              <div><h2>Check before you go</h2><p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>Review saved times, posted hours, and the forecast for this outing.</p></div>
              <button type="button" onClick={checkBeforeVisit} disabled={pending || !controlsReady} className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-link)" }}><RefreshCw className="h-4 w-4" aria-hidden />{pending ? "Checking…" : "Check this plan"}</button>
            </div>
            {visitCheck && <div aria-live="polite">
              <p className="mt-4 text-[14px] font-semibold">{checkExpired ? "This check is out of date. Check the plan again before setting out." : visitCheck.message}</p>
              <p className={styles.visitSource}>Checked <time dateTime={visitCheck.checkedAt}>{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(visitCheck.checkedAt))}</time>. Source dates are listed below. These records do not confirm live venue availability.</p>
              <ul className={styles.visitItems}>
                {visitCheck.stops.map((stop) => <li key={stop.spec_index}><strong>{stop.name ?? `Choice ${stop.spec_index + 1}`}</strong><p>{stop.message}</p><VisitSource label={stop.sourceLabel} asOf={stop.sourceAsOf} href={stop.sourceHref} /></li>)}
                <li><strong>Weather for this outing</strong><p>{visitCheck.weather.message}</p>{visitCheck.weather.periods.length > 0 && <ul className={styles.forecast} aria-label="Hourly forecast for this outing">{visitCheck.weather.periods.map((period) => <li key={period.startTime}><time dateTime={period.startTime}>{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" }).format(new Date(period.startTime))}</time><strong>{period.temperature}°{period.temperatureUnit}</strong><span>{period.shortForecast}</span>{period.probabilityOfPrecipitation != null && <span>{period.probabilityOfPrecipitation}% chance of precipitation</span>}</li>)}</ul>}<VisitSource label={visitCheck.weather.sourceLabel} asOf={visitCheck.weather.sourceAsOf} href={visitCheck.weather.sourceHref} /></li>
              </ul>
            </div>}
          </section>

          <PlanStopsMap plan={plan} returnTo={planReturnTo} disabled={!controlsReady} />

          <div className={`grid gap-2 ${plan.stops.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
            {plan.stops.length > 0 && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                disabled={pending || !controlsReady}
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
              disabled={pending || !controlsReady}
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
        subtitle={activeEventAnchor
          ? scheduledEventStop
            ? "The event keeps its published time. Change your company, focus, or outing length. Your current route stays until you rebuild it."
            : "Your event reference stays saved. Change your company, focus, or outing length, then review the event update before planning a visit."
          : "Change the area, time, company, or focus. Your current route stays until you rebuild it."}
      >
        <div className="space-y-5 px-4 py-4">
          {controls}
          <button
            type="button"
            onClick={onBuild}
            disabled={pending || !controlsReady}
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
                    disabled={pending || !controlsReady}
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
              No other place with confirmed-open hours fits this slot.
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
                      disabled={pending || !controlsReady}
                      className="flex min-h-16 w-full items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-left disabled:opacity-50"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <PlaceMedallion
                        place={{
                          slug: alternative.slug,
                          name: alternative.name,
                          category: alternative.category,
                          google_photo_url: alternative.photo_url,
                        }}
                        size={48}
                      />
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
                    disabled={pending || !controlsReady}
                    className="flex min-h-16 w-full items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-left disabled:opacity-50"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <PlaceMedallion place={place} size={48} />
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
  eventStart,
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
  verifiedHoursOnly,
  onVerifiedHoursOnlyChange,
}: {
  eventStart?: string;
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
  verifiedHoursOnly: boolean;
  onVerifiedHoursOnlyChange: (value: boolean) => void;
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

        {eventStart !== undefined ? <PickerRow label="Event start" Icon={CalendarDays} action={<span className="text-right text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>{eventStart ? clock(eventStart) : "Confirm the event listing"}</span>} /> : <PickerRow label="Start" Icon={CalendarDays} controlId="plan-start" action={
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
        }
        {eventStart === undefined && startMode === "custom" && (
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
          <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-3 text-[13px] font-medium" style={{ color: "var(--app-ink-2)" }}>
            <input type="checkbox" checked={verifiedHoursOnly} onChange={(event) => onVerifiedHoursOnlyChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--app-brand)]" />
            Only include stops with confirmed hours
          </label>
        </div>
      </details>
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        {verifiedHoursOnly
          ? "Only stops with confirmed hours will be included."
          : "Draft outing. Times are suggestions; confirm venue hours before setting out."}
      </p>
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
  returnTo,
  index,
  pending,
  busy,
  pinned,
  onSwap,
  onPin,
  onRemove,
}: {
  stop: Plan["stops"][number];
  returnTo?: string;
  index: number;
  pending: boolean;
  busy: number | null;
  pinned: boolean;
  onSwap?: () => void;
  onPin?: () => void;
  onRemove: () => void;
}) {
  const href = withBrowseReturnTo(stop.place ? `/places/${stop.place.slug}` : stop.event ? `/events/${stop.event.slug}` : "#", returnTo);
  const name = stop.place?.name ?? stop.event?.title ?? "Stop";
  const where = stop.place ? placeLocationLabel(stop.place.address, stop.place.city) : stop.event?.venue_name;
  const geom = stop.place?.geom ?? stop.event?.geom;
  const status = stop.event ? { text: "Published event time", color: "var(--app-positive)" } : OPEN_LABEL[stop.open];
  const fallbackPlace = {
    slug: stop.place?.slug ?? stop.event?.slug ?? `plan-stop-${stop.order}`,
    name,
    category: stop.place?.category ?? stop.event?.category ?? "attraction",
  };

  return (
    <li className={`${styles.stopEntry} relative`} data-plan-stop style={{ "--plan-stop-delay": `${Math.min(stop.order - 1, 5) * 55}ms` } as CSSProperties}>
      {stop.travel_from_previous_min && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
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
      <article className={styles.stopCard}>
        <div className={styles.stopBody} style={{ paddingBottom: 12 }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold">
              <span className="tabular-nums" style={{ color: "var(--app-ink-2)" }}>{clock(stop.at)} · {stop.duration_min} min</span>
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
          <PlaceMedallion place={fallbackPlace} size={48} className="rounded-[var(--app-radius-sm)]" />
        </div>
        </div>
        <PlanStopPhoto stop={stop} />
        <div className={styles.stopBody} style={{ paddingTop: 12 }}>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{stop.why}</p>

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
        </div>
      </article>
    </li>
  );
}

function PlanScene({ compact = false }: { compact?: boolean }) {
  return <div className={styles.scene} data-plan-scene>
    <Image src="/images/seasons/summer/SUMMER CARROL CREEK.jpg" alt="Carroll Creek in Frederick." fill priority={!compact} sizes="(min-width: 800px) 1080px, calc(100vw - 32px)" />
    <div className={styles.sceneText}>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[.12em]">Frederick County</p>
      {!compact && <><h1>Plan an outing.</h1><p>Choose where and when. Keep the places that matter to you.</p></>}
    </div>
  </div>;
}

function VisitSource({ label, asOf, href }: { label: string; asOf?: string; href?: string }) {
  return <p className={styles.visitSource}>
    {href ? <a href={href} target={href.startsWith("https:") ? "_blank" : undefined} rel="noopener noreferrer" className="underline underline-offset-2">{label}</a> : label}
    {asOf && <> · Source updated <time dateTime={asOf}>{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(asOf))}</time></>}
    {!asOf && " · Source update time unavailable"}
  </p>;
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
    <li className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--app-bg-sunken)] px-2.5 text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}>
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
  window.history.replaceState(null, "", updatedPlanHref(new URL(window.location.href), token));
}

function placeLocationLabel(address?: string, city?: string): string {
  const cleanAddress = address?.trim();
  const cleanCity = city?.trim();
  if (!cleanAddress) return cleanCity ?? "";
  if (!cleanCity || cleanAddress.toLowerCase() === cleanCity.toLowerCase()) return cleanAddress;
  return `${cleanAddress}, ${cleanCity}`;
}

function pinsInPlan(pins: Set<string>, plan: Plan): Set<string> {
  const selected = new Set(decodeSpec(plan.share)?.s.flatMap((ref) => "p" in ref ? [ref.p] : []) ?? []);
  return new Set([...pins].filter((slug) => selected.has(slug)));
}
