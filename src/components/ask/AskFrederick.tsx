"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  Check,
  Clock3,
  ExternalLink,
  LayoutGrid,
  LocateFixed,
  MapPin,
  MessageCircleQuestion,
  Navigation,
  Phone,
  Search,
  Share2,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { MUNICIPALITIES } from "@/data/municipalities";
import { readCachedPosition, useGeolocation } from "@/hooks/useGeolocation";
import { useSavedList } from "@/hooks/useSaved";
import { contextualizeAskQuery } from "@/lib/ask/followup";
import type {
  AskAction,
  AskPlanPreview,
  AskResult,
  AskSource,
} from "@/lib/ask/answer";
import { haptic } from "@/lib/haptics";
import { getInterests } from "@/lib/personalize";
import {
  getScope,
  scopeLabel,
  scopeTownSlug,
  setScope,
  subscribeScopeChange,
  type Scope,
} from "@/lib/scope";
import type { TodayPrompt } from "@/lib/today-prompts";
import { track } from "@/lib/track";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import SaveButton from "@/components/saved/SaveButton";
import RadiusToolbox from "@/components/ask/RadiusToolbox";

const ASK_CACHE_LIMIT = 24;
const ASK_CACHE_TTL_MS = 45_000;
const MAX_QUERY_LENGTH = 300;

const QUICK_ASKS = [
  {
    label: "Breakfast nearby",
    query: "Where can I get a good breakfast sandwich near me?",
  },
  {
    label: "Build a date night",
    query: "Plan a walkable date night for this evening.",
  },
  {
    label: "Plan an afternoon",
    query: "Plan an easy afternoon in Frederick County.",
  },
  {
    label: "What is on tonight?",
    query: "What events are happening tonight?",
  },
] satisfies TodayPrompt[];

const WORKSPACE_ASKS = [
  {
    label: "Dinner tonight",
    query: "Where should I eat in Frederick County tonight?",
  },
  {
    label: "What is on tonight?",
    query: "What is worth doing in Frederick County today?",
  },
  {
    label: "Plan an afternoon",
    query: "Plan a relaxed afternoon in Frederick County.",
  },
  {
    label: "Find a restroom",
    query: "Where is the nearest public restroom?",
  },
] as const;

const LOADING_MESSAGES = [
  "Radius is checking local data.",
  "Radius is comparing the strongest matches.",
  "Radius is checking the details behind the leading options.",
  "Radius is building the answer and attaching its sources.",
] as const;

type AskCacheEntry = { at: number; result: AskResult };
type AskMode = "compact" | "workspace";
export type AskRequestFailure = "network" | "rate-limit" | "service";
type AskOptions = {
  position?: { lat: number; lng: number } | null;
  scope?: Scope;
  skipNearbyGate?: boolean;
};

type ShareStatus = "idle" | "copied" | "shared" | "error";

const askCache = new Map<string, AskCacheEntry>();

/**
 * Ask permalinks contain only the question. Location, saved places, and taste
 * signals remain in the request body and never become shareable URL data.
 */
export function askQuestionPath(query: string): string {
  const text = query.trim().slice(0, MAX_QUERY_LENGTH);
  return text ? `/ask?q=${encodeURIComponent(text)}` : "/ask";
}

function replaceAskQuestionUrl(query: string): void {
  if (typeof window === "undefined") return;
  const next = askQuestionPath(query);
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === next) return;
  window.history.replaceState(window.history.state, "", next);
}

async function copyShareUrl(url: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const field = document.createElement("textarea");
  field.value = url;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("copy_failed");
}

function cacheAskResult(key: string, result: AskResult): void {
  if (askCache.has(key)) askCache.delete(key);
  askCache.set(key, { at: Date.now(), result });
  while (askCache.size > ASK_CACHE_LIMIT) {
    const oldest = askCache.keys().next().value as string | undefined;
    if (!oldest) break;
    askCache.delete(oldest);
  }
}

const errorResult = (answer: string): AskResult => ({
  status: "empty",
  configured: true,
  usedModel: false,
  answer,
  sources: [],
});

const NEARBY_LANGUAGE =
  /\b(?:near me|nearby|around me|closest|nearest|walking distance from me|walkable from me)\b/i;

/**
 * Nearby questions need a deliberate point or area. A network-derived point
 * is never treated as the user's location by this surface.
 */
export function queryNeedsNearbyContext(query: string): boolean {
  return NEARBY_LANGUAGE.test(query);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A town named in the question is just as deliberate as choosing it here. */
export function explicitAreaInQuery(query: string): Scope | null {
  if (/\bfrederick county\b/i.test(query)) return "county";
  for (const municipality of MUNICIPALITIES) {
    const name = escapeRegExp(municipality.name).replace(/\s+/g, "[ -]");
    if (new RegExp(`\\b${name}\\b`, "i").test(query)) {
      return `town:${municipality.slug}`;
    }
  }
  return null;
}

export function hasResolvedNearbyArea(
  scope: Scope | null,
  hasDevicePosition: boolean,
): boolean {
  if (hasDevicePosition) return true;
  return Boolean(scopeTownSlug(scope));
}

export function nearbyQueryNeedsAreaChoice(
  query: string,
  selectedScope: Scope | null,
  hasDevicePosition: boolean,
): boolean {
  if (!queryNeedsNearbyContext(query)) return false;
  const explicitScope = explicitAreaInQuery(query);
  // Naming the county in this question is a deliberate area choice. A county
  // value left over from an earlier visit is not precise enough for "near me."
  if (explicitScope === "county") return false;
  return !hasResolvedNearbyArea(
    explicitScope ?? selectedScope,
    hasDevicePosition,
  );
}

function activeContextLabel(
  scope: Scope | null,
  hasDevicePosition: boolean,
): string {
  if (scope === "nearme" && hasDevicePosition) return "Near your location";
  if (scope === "nearme") return "Whole county";
  if (scope) return scopeLabel(scope);
  return hasDevicePosition ? "Near your location" : "Whole county";
}

function requestScope(
  query: string,
  selectedScope: Scope | null,
  hasDevicePosition: boolean,
): Scope {
  const safeSelectedScope =
    selectedScope === "nearme" && !hasDevicePosition ? null : selectedScope;
  return (
    explicitAreaInQuery(query) ??
    safeSelectedScope ??
    (hasDevicePosition ? "nearme" : "county")
  );
}

export function sourceSaveTarget(source: Pick<AskSource, "href">): {
  type: "place" | "event";
  id: string;
} | null {
  const match = source.href.match(/^\/(places|events)\/([^/?#]+)/);
  if (!match) return null;
  return {
    type: match[1] === "places" ? "place" : "event",
    id: match[2],
  };
}

export function askResultHeading(
  result: Pick<AskResult, "intent" | "status">,
  failure: AskRequestFailure | null,
): string {
  if (failure) return "Radius could not complete that request.";
  if (result.status === "empty") return "Radius could not find a solid match.";
  return result.intent?.label ?? "Radius answer";
}

export function sourceHasDistinctDetail(
  source: Pick<AskSource, "detail" | "reason">,
): boolean {
  const detail = source.detail?.trim();
  if (!detail) return false;
  const reason = source.reason?.trim();
  if (!reason) return true;
  const normalizedDetail = detail.toLocaleLowerCase();
  const normalizedReason = reason
    .replace(/[.…]+$/u, "")
    .trim()
    .toLocaleLowerCase();
  return (
    normalizedDetail !== normalizedReason &&
    !(normalizedReason.length >= 24 && normalizedDetail.startsWith(normalizedReason))
  );
}

function sourceOpenLabel(source: AskSource): string {
  if (/google\.com\/maps|\/maps\/dir/i.test(source.href)) return "Directions";
  return source.href.startsWith("http") ? "Open source" : "Open details";
}

function AskSourceCard({ source, index }: { source: AskSource; index: number }) {
  const external = source.href.startsWith("http");
  const saveTarget = sourceSaveTarget(source);
  const phone = source.phone?.replace(/[^+\d]/g, "");
  const photoNeedsCredit = Boolean(
    source.photo_url &&
      (/\/api\/place-photo/i.test(source.photo_url) ||
        /googleusercontent\.com|places\.googleapis\.com/i.test(source.photo_url)),
  );

  return (
    <article
      className="overflow-hidden rounded-[20px] border"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
        boxShadow: "var(--app-elev-1)",
      }}
    >
      <div className="grid grid-cols-[92px_minmax(0,1fr)] sm:grid-cols-[116px_minmax(0,1fr)]">
        <div className="relative min-h-[116px] overflow-hidden bg-[var(--app-bg-sunken)]">
          {source.photo_url ? (
            <>
              <Image
                src={source.photo_url}
                alt=""
                fill
                sizes="(max-width: 640px) 92px, 116px"
                unoptimized={source.photo_url.startsWith("/api/place-photo")}
                placeholder="blur"
                blurDataURL={PAPER_CREAM_BLUR}
                className="object-cover transition duration-300 hover:scale-[1.025]"
              />
              {photoNeedsCredit ? (
                <span className="absolute bottom-0 right-0 bg-black/70 px-1.5 py-1 text-[8px] leading-none text-white">
                  Google Maps
                </span>
              ) : null}
            </>
          ) : (
            <span
              className="absolute inset-0 grid place-items-center"
              style={{
                background:
                  "linear-gradient(145deg, color-mix(in srgb, var(--app-brand) 13%, var(--app-bg-elevated-solid)), var(--app-bg-sunken))",
                color: "var(--app-brand-press)",
              }}
            >
              <MapPin className="h-7 w-7" strokeWidth={1.5} aria-hidden />
            </span>
          )}
        </div>

        <div className="min-w-0 p-3.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p
                className="text-[10px] font-bold uppercase tracking-[0.11em]"
                style={{ color: "var(--app-brand-press)" }}
              >
                {String(index + 1).padStart(2, "0")} · {source.eyebrow || source.category}
              </p>
              <Link
                href={source.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="mt-1 block font-serif text-[17px] font-semibold leading-tight tracking-tight hover:underline"
                style={{ color: "var(--app-ink)" }}
              >
                {source.name}
              </Link>
            </div>
            {saveTarget ? (
              <SaveButton
                refType={saveTarget.type}
                refId={saveTarget.id}
                label={`Save ${source.name}`}
              />
            ) : null}
          </div>

          {source.reason ? (
            <p
              className="mt-1.5 text-[12px] font-medium leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              {source.reason}
            </p>
          ) : null}
          {sourceHasDistinctDetail(source) ? (
            <p
              className="mt-1 line-clamp-2 text-[11px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              {source.detail}
            </p>
          ) : null}

          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {source.distance ? (
              <span className="inline-flex items-center gap-1">
                <Navigation className="h-3 w-3" aria-hidden />
                {source.distance}
              </span>
            ) : null}
            {source.status ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3" aria-hidden />
                {source.status}
              </span>
            ) : null}
            {source.city ? <span>{source.city}</span> : null}
          </div>
        </div>
      </div>

      <div
        className="flex min-h-11 items-center gap-1 border-t px-2"
        style={{ borderColor: "var(--app-border)" }}
      >
        <Link
          href={source.href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          onClick={() => haptic("light")}
          className="tap-44 inline-flex flex-1 items-center justify-center gap-1.5 rounded-[12px] px-3 text-[11.5px] font-semibold transition hover:bg-[var(--app-bg-sunken)] active:scale-[0.98]"
          style={{ color: "var(--app-brand-press)" }}
        >
          {sourceOpenLabel(source)}
          {external ? (
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </Link>
        {phone ? (
          <a
            href={`tel:${phone}`}
            onClick={() => haptic("light")}
            aria-label={`Call ${source.name} at ${source.phone}`}
            className="tap-44 inline-flex items-center justify-center gap-1.5 rounded-[12px] px-3 text-[11.5px] font-semibold transition hover:bg-[var(--app-bg-sunken)] active:scale-[0.98]"
            style={{ color: "var(--app-ink-2)" }}
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Call
          </a>
        ) : null}
      </div>
    </article>
  );
}

function AskPlanCard({ plan }: { plan: AskPlanPreview }) {
  return (
    <section
      aria-labelledby="ask-plan-title"
      className="mt-4 overflow-hidden rounded-[22px] border"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
        boxShadow: "var(--app-elev-1)",
      }}
    >
      <div
        className="flex items-start justify-between gap-3 border-b px-4 py-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>
            A route you can edit
          </p>
          <h3
            id="ask-plan-title"
            className="mt-1 font-serif text-[20px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {plan.title}
          </h3>
          <p
            className="mt-1 text-[12px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            {plan.summary}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          {plan.stops.length} {plan.stops.length === 1 ? "stop" : "stops"}
        </span>
      </div>

      <ol data-testid="ask-plan-stops" className="px-4 py-1">
        {plan.stops.map((stop, index) => (
          <li
            key={`${stop.order}-${stop.href}`}
            className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-b py-3.5 last:border-b-0"
            style={{ borderColor: "var(--app-border)" }}
          >
            {index < plan.stops.length - 1 ? (
              <span
                className="absolute bottom-[-7px] left-[13px] top-[38px] w-px"
                style={{ background: "var(--app-border-strong, var(--app-border))" }}
                aria-hidden
              />
            ) : null}
            <span
              className="relative z-10 grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold"
              style={{
                background: "var(--app-brand-press)",
                color: "var(--app-on-brand, #fff)",
              }}
            >
              {stop.order}
            </span>
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={stop.href}
                  className="font-serif text-[16px] font-semibold leading-tight hover:underline"
                  style={{ color: "var(--app-ink)" }}
                >
                  {stop.name}
                </Link>
                <span
                  className="shrink-0 font-mono text-[10px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {stop.time}
                </span>
              </div>
              <p
                className="mt-1 text-[11.5px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                {stop.why}
              </p>
              <div
                className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {stop.status ? <span>{stop.status}</span> : null}
                {stop.tip ? <span>{stop.tip}</span> : null}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <Link
        href={plan.href}
        className="group flex min-h-12 items-center justify-between border-t px-4 text-[12px] font-semibold"
        style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
      >
        Open and edit this route
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </section>
  );
}

type AreaChooserProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  currentScope: Scope | null;
  geolocationStatus: ReturnType<typeof useGeolocation>["state"]["status"];
  hasDevicePosition: boolean;
  onUseLocation: () => void;
  onChooseScope: (scope: Scope) => void;
};

function AreaChooser({
  containerRef,
  currentScope,
  geolocationStatus,
  hasDevicePosition,
  onUseLocation,
  onChooseScope,
}: AreaChooserProps) {
  const selectedTown = scopeTownSlug(currentScope) ?? "";
  const locationFailed =
    geolocationStatus === "denied" ||
    geolocationStatus === "unavailable" ||
    geolocationStatus === "error";

  return (
    <div
      ref={containerRef}
      id="ask-area-chooser"
      role="group"
      aria-labelledby="ask-area-heading"
      tabIndex={-1}
      className="mt-2 rounded-[18px] border p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
        boxShadow: "var(--app-elev-1)",
      }}
    >
      <p
        id="ask-area-heading"
        className="text-[13px] font-semibold"
        style={{ color: "var(--app-ink)" }}
      >
        Choose where Radius should look.
      </p>
      <p
        className="mt-1 text-[11px] leading-relaxed"
        style={{ color: "var(--app-ink-3)" }}
      >
        Radius uses a device location only after you ask it to. It never treats a
        network location as your precise position.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onUseLocation}
          disabled={geolocationStatus === "loading"}
          aria-pressed={currentScope === "nearme" && hasDevicePosition}
          className="tap-44 inline-flex min-h-11 items-center justify-center gap-2 rounded-[13px] border px-3 text-[11.5px] font-semibold transition active:scale-[0.98] disabled:opacity-55"
          style={{
            borderColor:
              currentScope === "nearme" && hasDevicePosition
                ? "var(--app-brand)"
                : "var(--app-border)",
            background:
              currentScope === "nearme" && hasDevicePosition
                ? "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated-solid))"
                : "transparent",
            color: "var(--app-ink-2)",
          }}
        >
          <LocateFixed className="h-4 w-4" aria-hidden />
          {geolocationStatus === "loading" ? "Finding you…" : "Use my location"}
        </button>
        <button
          type="button"
          onClick={() => onChooseScope("county")}
          aria-pressed={currentScope === "county"}
          className="tap-44 inline-flex min-h-11 items-center justify-center gap-2 rounded-[13px] border px-3 text-[11.5px] font-semibold transition active:scale-[0.98]"
          style={{
            borderColor:
              currentScope === "county" ? "var(--app-brand)" : "var(--app-border)",
            background:
              currentScope === "county"
                ? "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated-solid))"
                : "transparent",
            color: "var(--app-ink-2)",
          }}
        >
          {currentScope === "county" ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <MapPin className="h-4 w-4" aria-hidden />
          )}
          Whole county
        </button>
      </div>

      <label
        className="mt-3 block text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Choose a town
        <select
          value={selectedTown}
          onChange={(event) => {
            if (event.target.value) onChooseScope(`town:${event.target.value}`);
          }}
          className="mt-1.5 block min-h-11 w-full rounded-[13px] border bg-[var(--app-bg-elevated-solid)] px-3 text-[13px] font-semibold normal-case tracking-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
        >
          <option value="">Select a town</option>
          {MUNICIPALITIES.map((municipality) => (
            <option key={municipality.slug} value={municipality.slug}>
              {municipality.name}
            </option>
          ))}
        </select>
      </label>

      {locationFailed ? (
        <p
          role="status"
          className="mt-2 text-[11px] leading-relaxed"
          style={{ color: "var(--app-brand-press)" }}
        >
          Radius could not get a device location. Choose a town or search the
          whole county instead.
        </p>
      ) : null}
    </div>
  );
}

type AskFrederickProps = {
  hideLabel?: boolean;
  initialQuery?: string;
  mode?: AskMode;
  quickAsks?: TodayPrompt[];
  placeholder?: string;
};

export default function AskFrederick({
  hideLabel = false,
  initialQuery = "",
  mode = "compact",
  quickAsks = QUICK_ASKS,
  placeholder = "Ask for a place, a plan, or what is happening",
}: AskFrederickProps = {}) {
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [res, setRes] = useState<AskResult | null>(null);
  const [requestFailure, setRequestFailure] =
    useState<AskRequestFailure | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [permalinkQuery, setPermalinkQuery] = useState("");
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [showAllSources, setShowAllSources] = useState(false);
  const [showAreaChooser, setShowAreaChooser] = useState(false);
  const [nearbyGateQuery, setNearbyGateQuery] = useState<string | null>(null);
  const [currentScope, setCurrentScope] = useState<Scope | null>(null);
  const [hasCachedPosition, setHasCachedPosition] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const areaChooserRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);
  const answerHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);
  const pendingNearbyQueryRef = useRef<string | null>(null);
  const urlQueryRef = useRef<string | null>(null);
  const askRef = useRef<(query: string, options?: AskOptions) => Promise<void>>(
    async () => {},
  );
  const saved = useSavedList();
  const geolocation = useGeolocation();
  const workspace = mode === "workspace";
  const hasDevicePosition =
    geolocation.state.status === "granted" || hasCachedPosition;
  const contextLabel = activeContextLabel(currentScope, hasDevicePosition);

  useEffect(() => {
    setCurrentScope(getScope());
    setHasCachedPosition(Boolean(readCachedPosition()));
    const unsubscribe = subscribeScopeChange((scope) => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      lastQueryRef.current = null;
      setLoading(false);
      setRes(null);
      setRequestFailure(null);
      setSubmittedQuery("");
      setCurrentScope(scope);
    });
    return () => {
      unsubscribe();
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const compareTimer = window.setTimeout(() => setLoadingStage(1), 1_300);
    const detailsTimer = window.setTimeout(() => setLoadingStage(2), 3_200);
    const sourcesTimer = window.setTimeout(() => setLoadingStage(3), 5_600);
    return () => {
      window.clearTimeout(compareTimer);
      window.clearTimeout(detailsTimer);
      window.clearTimeout(sourcesTimer);
    };
  }, [loading]);

  useEffect(() => {
    if (!showAreaChooser || !nearbyGateQuery) return;
    const frame = window.requestAnimationFrame(() => {
      areaChooserRef.current?.focus({ preventScroll: true });
      areaChooserRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [nearbyGateQuery, showAreaChooser]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      loadingRef.current?.focus({ preventScroll: true });
      loadingRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!res || loading) return;
    const frame = window.requestAnimationFrame(() => {
      answerHeadingRef.current?.focus({ preventScroll: true });
      answerHeadingRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, res]);

  useEffect(() => {
    if (geolocation.state.status !== "granted") return;
    const pendingQuery = pendingNearbyQueryRef.current;
    pendingNearbyQueryRef.current = null;
    setScope("nearme");
    setHasCachedPosition(true);
    setNearbyGateQuery(null);
    setShowAreaChooser(false);
    if (pendingQuery) {
      void askRef.current(pendingQuery, {
        position: geolocation.state.position,
        scope: "nearme",
        skipNearbyGate: true,
      });
    }
  }, [geolocation.state]);

  useEffect(() => {
    // Next may restore a cached server component when the visitor returns
    // from a source. Read the real browser URL first so a replaced `?q=` is
    // not overwritten by the older server-prop snapshot.
    const browserQuery =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("q") ?? "";
    const text = (browserQuery || initialQuery).trim().slice(0, MAX_QUERY_LENGTH);
    if (!text || urlQueryRef.current === text) return;
    urlQueryRef.current = text;
    void askRef.current(text);
  }, [initialQuery]);

  async function ask(query: string, options: AskOptions = {}): Promise<void> {
    const text = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (!text) return;
    const position = options.position === undefined ? readCachedPosition() : options.position;
    const selectedScope = options.scope ?? getScope();
    const resolvedScope = requestScope(text, selectedScope, Boolean(position));

    if (
      !options.skipNearbyGate &&
      nearbyQueryNeedsAreaChoice(text, selectedScope, Boolean(position))
    ) {
      pendingNearbyQueryRef.current = text;
      setQ(text);
      setNearbyGateQuery(text);
      setShowAreaChooser(true);
      inputRef.current?.blur();
      setRes(null);
      setRequestFailure(null);
      haptic("light");
      track("ask_location_gate");
      return;
    }

    const contextualQuery = contextualizeAskQuery(text, lastQueryRef.current);
    inputRef.current?.blur();
    // A deliberate county or town choice must survive all the way to the API.
    // Supplying this scope also prevents the Ask surface from falling through
    // to a network-derived ranking origin when no device fix exists.
    const effectiveQuery = contextualQuery;
    urlQueryRef.current = effectiveQuery;
    replaceAskQuestionUrl(effectiveQuery);
    setPermalinkQuery(effectiveQuery);
    setShareStatus("idle");
    abortRef.current?.abort();
    const requestId = ++requestIdRef.current;
    const savedPlaceSlugs = saved
      .filter((item) => item.type === "place")
      .map((item) => item.id)
      .slice(0, 30);
    const interests = getInterests().slice(0, 12);
    const tasteKey = `${savedPlaceSlugs.slice().sort().join(",")}|${interests
      .slice()
      .sort()
      .join(",")}`;
    const cacheKey = `${effectiveQuery.toLowerCase()}|${resolvedScope}|${
      position ? `${position.lat.toFixed(3)},${position.lng.toFixed(3)}` : "no-fix"
    }|${tasteKey}`;

    setQ(text);
    setRequestFailure(null);
    setNearbyGateQuery(null);
    setShowAreaChooser(false);
    setLoadingStage(0);
    haptic("light");
    track("ask_submit", { surface: workspace ? "workspace" : "compact" });

    const cached = askCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= ASK_CACHE_TTL_MS) {
      setLoading(false);
      setRequestFailure(null);
      setSubmittedQuery(text);
      setShowAllSources(false);
      setRes(cached.result);
      if (cached.result.status !== "empty") {
        lastQueryRef.current = effectiveQuery;
        setQ("");
      }
      return;
    }
    if (cached) askCache.delete(cacheKey);

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: effectiveQuery,
          scope: resolvedScope,
          lat: position ? Number(position.lat.toFixed(4)) : undefined,
          lng: position ? Number(position.lng.toFixed(4)) : undefined,
          taste: { savedPlaceSlugs, interests },
        }),
        signal: controller.signal,
      });

      let next: AskResult;
      let failure: AskRequestFailure | null = null;
      if (response.status === 429) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        failure = "rate-limit";
        next = errorResult(body.message ?? "Too many questions. Give it a moment.");
      } else if (!response.ok) {
        failure = "service";
        next = errorResult("Radius could not answer just now. Try again in a minute.");
      } else {
        next = (await response.json()) as AskResult;
        cacheAskResult(cacheKey, next);
      }
      if (requestId === requestIdRef.current) {
        setRequestFailure(failure);
        setSubmittedQuery(text);
        setShowAllSources(false);
        setRes(next);
        if (next.status !== "empty") {
          lastQueryRef.current = effectiveQuery;
          setQ("");
        } else {
          // The question Radius could not answer IS the roadmap: the query
          // text goes with the event so the dashboard shows what was wanted
          // and missed. Queries here are place-seeking text ("vegan brunch
          // thurmont"), not identity; clamped and case-folded all the same.
          track("ask_empty", { query: effectiveQuery.toLowerCase().slice(0, 80) });
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === requestIdRef.current) {
        setRequestFailure("network");
        setSubmittedQuery(text);
        setShowAllSources(false);
        setRes(
          errorResult(
            "Radius could not reach the answer service. Check your connection and try again.",
          ),
        );
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  }

  askRef.current = ask;

  function chooseScope(nextScope: Scope): void {
    const pendingQuery = pendingNearbyQueryRef.current;
    pendingNearbyQueryRef.current = null;
    setScope(nextScope);
    setCurrentScope(nextScope);
    setNearbyGateQuery(null);
    setShowAreaChooser(false);
    if (pendingQuery) {
      void ask(pendingQuery, { scope: nextScope, skipNearbyGate: true });
    }
  }

  function useDeviceLocation(): void {
    const cached = readCachedPosition();
    if (cached) {
      const pendingQuery = pendingNearbyQueryRef.current;
      pendingNearbyQueryRef.current = null;
      setScope("nearme");
      setCurrentScope("nearme");
      setHasCachedPosition(true);
      setNearbyGateQuery(null);
      setShowAreaChooser(false);
      if (pendingQuery) {
        void ask(pendingQuery, {
          position: cached,
          scope: "nearme",
          skipNearbyGate: true,
        });
      }
      return;
    }
    geolocation.request();
  }

  function runAction(action: AskAction): void {
    if (action.query) void ask(action.query);
  }

  function runIntent(query: string): void {
    setQ(query);
    void ask(query);
  }

  async function shareQuestion(): Promise<void> {
    const query = permalinkQuery.trim();
    if (!query || typeof window === "undefined") return;
    const url = new URL(askQuestionPath(query), window.location.origin).toString();

    // Share the ANSWER when one is on screen, not just the question — a
    // plan texted to a friend only works if the plan itself rides in the
    // message (owner ask, 2026-07-18: "text or email plans that are
    // made"). The permalink still comes along for the tap-through; the
    // question alone remains the fallback while an answer is loading.
    const answer = res?.answer?.trim() ?? "";
    const shareText =
      answer.length > 600 ? `${answer.slice(0, 597).trimEnd()}…` : answer || query;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Ask Radius",
          text: shareText,
          url,
        });
        setShareStatus("shared");
        track("ask_share", { method: "native" });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await copyShareUrl(url);
      setShareStatus("copied");
      track("ask_share", { method: "clipboard" });
    } catch {
      setShareStatus("error");
    }
  }

  const visibleSources = res?.sources.slice(0, showAllSources ? undefined : 2) ?? [];
  const resultActions = (res?.actions ?? []).filter(
    (action) => !res?.plan || action.href !== res.plan.href,
  );
  const collapsedSourceCount = 2;

  return (
    <section
      aria-labelledby={workspace ? "ask-radius-heading" : undefined}
      className={workspace ? "mx-auto max-w-[760px]" : undefined}
    >
      {workspace ? (
        <header className={`${res ? "mb-3" : "mb-5"} max-w-[660px]`}>
          <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>
            Ask Radius
          </p>
          <h1
            id="ask-radius-heading"
            className={`${res ? "mt-1 text-[28px] sm:text-[34px]" : "mt-2 text-[36px] sm:text-[46px]"} font-serif font-semibold leading-[0.98] tracking-[-0.03em]`}
            style={{ color: "var(--app-ink)" }}
          >
            Tell Radius what you need.
          </h1>
          {!res ? (
            <p
              className="mt-3 max-w-[580px] text-[14px] leading-relaxed sm:text-[15px]"
              style={{ color: "var(--app-ink-2)" }}
            >
              Radius checks the guide&apos;s current local data, then gives you a
              short answer that you can act on.
            </p>
          ) : null}
        </header>
      ) : !hideLabel ? (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p
            className="flex items-center gap-2 text-[12px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            <MessageCircleQuestion className="h-4 w-4" aria-hidden /> Ask Radius
          </p>
          <p className="text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
            Answers use Radius listings and cited local sources.
          </p>
        </div>
      ) : null}

      <div
        className={workspace ? "rounded-[26px] border p-3 sm:p-4" : undefined}
        style={
          workspace
            ? {
                borderColor: "var(--app-border-strong, var(--app-border))",
                background: "var(--app-bg-elevated-solid)",
                boxShadow: "var(--app-elev-2)",
              }
            : undefined
        }
      >
        <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
          <p
            aria-label={`Search area: ${contextLabel}`}
            className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{contextLabel}</span>
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            {workspace ? (
              <a
                href="#radius-tools"
                className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-semibold transition hover:bg-[var(--app-bg-sunken)] active:scale-[0.98]"
                style={{ color: "var(--app-ink-2)" }}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                Tools
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setShowAreaChooser((open) => !open)}
              aria-expanded={showAreaChooser}
              aria-controls="ask-area-chooser"
              className="tap-44 shrink-0 rounded-full px-2.5 text-[10.5px] font-semibold transition hover:bg-[var(--app-bg-sunken)] active:scale-[0.98]"
              style={{ color: "var(--app-brand-press)" }}
            >
              Change area
            </button>
          </div>
        </div>

        {showAreaChooser ? (
          <AreaChooser
            containerRef={areaChooserRef}
            currentScope={currentScope}
            geolocationStatus={geolocation.state.status}
            hasDevicePosition={hasDevicePosition}
            onUseLocation={useDeviceLocation}
            onChooseScope={chooseScope}
          />
        ) : null}

        <form
          role="search"
          aria-label="Ask Radius"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(q);
          }}
          className={
            workspace
              ? "mt-2 overflow-hidden rounded-[18px] border bg-[var(--app-bg-elevated-solid)] p-2"
              : "mt-2 flex items-center gap-2 rounded-[14px] border bg-[var(--app-bg-elevated-solid)] py-1 pl-4 pr-1.5"
          }
          style={{
            borderColor: "var(--app-border-strong, var(--app-border))",
            boxShadow: workspace ? "inset 0 1px 0 rgba(255,255,255,0.55)" : "var(--app-elev-1)",
          }}
        >
          {workspace ? (
            <textarea
              ref={(node) => {
                inputRef.current = node;
              }}
              value={q}
              rows={res ? 1 : 2}
              maxLength={MAX_QUERY_LENGTH}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  if (q.trim() && !loading) void ask(q);
                }
              }}
              placeholder={
                res
                  ? "Ask for a closer option or change the time."
                  : "Try: I need a quiet dinner near downtown before a 7:30 show."
              }
              className={`${res ? "min-h-[52px]" : "min-h-[78px]"} w-full resize-none bg-transparent px-2.5 py-2 text-[16px] leading-relaxed outline-none placeholder:text-[var(--app-ink-3)]`}
              style={{ color: "var(--app-ink)" }}
              aria-label="Ask Frederick Radius"
            />
          ) : (
            <input
              ref={(node) => {
                inputRef.current = node;
              }}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={
                res ? "Ask for a closer option or another time…" : placeholder
              }
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--app-ink-3)]"
              style={{ color: "var(--app-ink)" }}
              aria-label="Ask Frederick Radius"
            />
          )}

          {workspace ? (
            <div className="flex items-center justify-between gap-3 px-1 pb-1">
              <span
                className="hidden items-center gap-1.5 text-[10.5px] sm:inline-flex"
                style={{ color: "var(--app-ink-3)" }}
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
                Ask about places, plans, events, or local services.
              </span>
              <button
                type="submit"
                disabled={!q.trim() || loading}
                className="tap-44 ml-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-[13px] px-4 text-[12px] font-bold transition active:scale-[0.98] disabled:opacity-35"
                style={{
                  background: "var(--app-brand-press)",
                  color: "var(--app-on-brand, #fff)",
                }}
              >
                Ask Radius
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={!q.trim() || loading}
              aria-label="Ask Radius"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] transition active:scale-95 disabled:opacity-35"
              style={{
                background: "var(--app-brand-press)",
                color: "var(--app-on-brand, #fff)",
              }}
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          )}
        </form>

        {nearbyGateQuery ? (
          <div
            role="status"
            className="mt-3 rounded-[15px] border-l-2 px-3.5 py-3"
            style={{
              borderColor: "var(--app-brand)",
              background: "var(--app-bg-sunken)",
              color: "var(--app-ink-2)",
            }}
          >
            <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Radius needs a real area for that question.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed">
              Use your device location or choose an area below.
            </p>
          </div>
        ) : null}

        {!workspace && quickAsks.length > 0 ? (
          <div className="mt-2 flex min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Questions to try">
            {quickAsks.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                onClick={() => void ask(prompt.query)}
                disabled={loading}
                className="min-h-8 shrink-0 rounded-full border px-2.5 text-[10.5px] font-semibold transition active:scale-[0.98] disabled:opacity-45"
                style={{
                  borderColor: "var(--app-border)",
                  background: "transparent",
                  color: "var(--app-ink-2)",
                }}
              >
                {prompt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {workspace && !res && !loading && !nearbyGateQuery ? (
        <section aria-labelledby="ask-start-heading" className="mt-4">
          <h2
            id="ask-start-heading"
            className="px-1 text-[10px] font-bold uppercase tracking-[0.11em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Questions to try
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {WORKSPACE_ASKS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                onClick={() => runIntent(prompt.query)}
                className="tap-44 min-h-11 min-w-0 rounded-full border px-3 text-[11.5px] font-semibold transition hover:bg-[var(--app-bg-sunken)] active:scale-[0.98]"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-elevated-solid)",
                  color: "var(--app-ink-2)",
                }}
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div aria-live="polite" aria-atomic="true" aria-busy={loading}>
        {loading ? (
          <div
            ref={loadingRef}
            tabIndex={-1}
            className={
              workspace
                ? "mt-5 rounded-[18px] border px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                : "mt-3 border-l-2 px-3 py-2 outline-none"
            }
            style={{
              color: "var(--app-ink-2)",
              borderColor: "var(--app-brand)",
              background: "var(--app-bg-sunken)",
            }}
          >
            <div className="flex items-center gap-2.5 text-[12px] font-semibold">
              <span
                className="pulse-dot h-2 w-2 rounded-full"
                style={{ background: "var(--app-brand)" }}
                aria-hidden
              />
              {LOADING_MESSAGES[loadingStage]}
            </div>
            {workspace ? (
              <div className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden>
                {LOADING_MESSAGES.map((_, index) => (
                  <span
                    key={index}
                    className="h-1 rounded-full transition-colors"
                    style={{
                      background:
                        index <= loadingStage ? "var(--app-brand)" : "var(--app-border)",
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : res ? (
          <span className="sr-only">
            {requestFailure
              ? "Radius could not complete that request."
              : res.plan
                ? "Radius plan ready."
                : `Radius answer ready with ${res.sources.length} ${
                    res.sources.length === 1 ? "source" : "sources"
                  }.`}
          </span>
        ) : null}
      </div>

      {res ? (
          <div
            inert={loading ? true : undefined}
            className={`${workspace ? "mt-4" : "mt-3 border-t pt-3"} transition-opacity ${loading ? "opacity-55" : ""}`}
            style={!workspace ? { borderColor: "var(--app-border)" } : undefined}
          >
            <section
              aria-labelledby="ask-answer-heading"
              className={workspace ? "rounded-[22px] border p-4 sm:p-5" : undefined}
              style={
                workspace
                  ? {
                      borderColor: "var(--app-border)",
                      background: "var(--app-bg-elevated-solid)",
                      boxShadow: "var(--app-elev-1)",
                    }
                  : undefined
              }
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2
                  ref={answerHeadingRef}
                  id="ask-answer-heading"
                  tabIndex={-1}
                  className={workspace ? "font-serif text-[20px] font-semibold tracking-tight" : "text-[12px] font-semibold"}
                  style={{ color: "var(--app-ink)" }}
                >
                  {askResultHeading(res, requestFailure)}
                </h2>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {res.context ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
                    >
                      <MapPin className="h-3 w-3" aria-hidden />
                      {res.context}
                    </span>
                  ) : null}
                  {workspace && permalinkQuery ? (
                    <button
                      type="button"
                      onClick={() => void shareQuestion()}
                      className="tap-44 inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-semibold transition hover:bg-[var(--app-bg-sunken)] active:scale-[0.98]"
                      style={{ color: "var(--app-brand-press)" }}
                    >
                      {shareStatus === "copied" || shareStatus === "shared" ? (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Share2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {shareStatus === "copied"
                        ? "Link copied"
                        : shareStatus === "shared"
                          ? "Shared"
                          : shareStatus === "error"
                            ? "Try sharing again"
                            : "Share question"}
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="sr-only" role="status" aria-live="polite">
                {shareStatus === "copied"
                  ? "The question link is ready to paste."
                  : shareStatus === "shared"
                    ? "The question was sent."
                    : shareStatus === "error"
                      ? "Radius could not copy the question link."
                      : ""}
              </p>
              {workspace && submittedQuery ? (
                <p
                  className="mb-3 line-clamp-2 text-[11px] leading-relaxed"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Answering: {submittedQuery}
                </p>
              ) : null}
              {res.answer ? (
                <p
                  className="whitespace-pre-wrap text-[15px] leading-[1.68] sm:text-[16px]"
                  style={{ color: "var(--app-ink)" }}
                >
                  {res.answer}
                </p>
              ) : null}
            </section>

            {res.plan ? <AskPlanCard plan={res.plan} /> : null}

            {resultActions.length > 0 ? (
              <nav aria-label="Next steps" className="mt-4">
                <p className="eyebrow mb-2 px-1" style={{ color: "var(--app-ink-3)" }}>
                  Next step
                </p>
                <div className="flex flex-wrap gap-2">
                  {resultActions.map((action, index) =>
                    action.href ? (
                      <Link
                        key={`${action.label}-${action.href}`}
                        href={action.href}
                        target={action.href.startsWith("http") ? "_blank" : undefined}
                        rel={action.href.startsWith("http") ? "noopener noreferrer" : undefined}
                        className="tap-44 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[11.5px] font-semibold transition active:scale-[0.98]"
                        style={
                          index === 0
                            ? {
                                borderColor: "var(--app-brand-press)",
                                color: "var(--app-on-brand)",
                                background: "var(--app-brand-press)",
                              }
                            : {
                                borderColor: "var(--app-border)",
                                color: "var(--app-ink-2)",
                                background: "var(--app-bg-elevated-solid)",
                              }
                        }
                      >
                        {action.label}
                        {action.href.startsWith("http") ? (
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </Link>
                    ) : (
                      <button
                        key={`${action.label}-${action.query}`}
                        type="button"
                        onClick={() => runAction(action)}
                        className="tap-44 min-h-11 rounded-full border px-3.5 text-[11.5px] font-semibold transition active:scale-[0.98]"
                        style={
                          index === 0
                            ? {
                                borderColor: "var(--app-brand-press)",
                                color: "var(--app-on-brand)",
                                background: "var(--app-brand-press)",
                              }
                            : {
                                borderColor: "var(--app-border)",
                                color: "var(--app-ink-2)",
                                background: "var(--app-bg-elevated-solid)",
                              }
                        }
                      >
                        {action.label}
                      </button>
                    ),
                  )}
                </div>
              </nav>
            ) : null}

            {res.sources.length > 0 ? (
              <section aria-labelledby="ask-sources-heading" className="mt-5">
                <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
                  <div>
                    <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
                      What Radius checked
                    </p>
                    <h2
                      id="ask-sources-heading"
                      className="mt-1 font-serif text-[19px] font-semibold tracking-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      Sources behind this answer
                    </h2>
                  </div>
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {res.sources.length} {res.sources.length === 1 ? "match" : "matches"}
                  </span>
                </div>
                <div className={`grid gap-2.5 ${visibleSources.length > 1 ? "sm:grid-cols-2" : ""}`}>
                  {visibleSources.map((source, index) => (
                    <AskSourceCard
                      key={`${source.category}-${source.slug}-${source.href}`}
                      source={source}
                      index={index}
                    />
                  ))}
                </div>
                {res.sources.length > collapsedSourceCount ? (
                  <button
                    type="button"
                    onClick={() => setShowAllSources((value) => !value)}
                    className="tap-44 mt-2 flex min-h-11 w-full items-center justify-center rounded-[14px] border text-[11.5px] font-semibold transition active:scale-[0.99]"
                    style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
                  >
                    {showAllSources ? "Show fewer matches" : `Show all ${res.sources.length} matches`}
                  </button>
                ) : null}
              </section>
            ) : null}

          </div>
      ) : null}

      {workspace ? <RadiusToolbox compact={Boolean(res)} /> : null}
    </section>
  );
}
