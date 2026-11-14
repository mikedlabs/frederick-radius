"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  LocateFixed,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Share2,
  Star,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  ASK_COMPOSER_INPUT_CLASS,
  ASK_COMPOSER_INPUT_STYLE,
  AskComposerFrame,
  AskComposerMark,
  AskComposerSubmit,
} from "@/components/ask/AskComposer";
import AskCorrectionControl from "@/components/ask/AskCorrectionControl";
import Sheet from "@/components/ui/Sheet";
import { MUNICIPALITIES } from "@/data/municipalities";
import { readCachedPosition, useGeolocation } from "@/hooks/useGeolocation";
import { answerCanLocalize } from "@/lib/ask/localize";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { contextualizeAskQuery } from "@/lib/ask/followup";
import { readAskFitContext } from "@/lib/ask/fit";
import type {
  AskAction,
  AskPlanPreview,
  AskResult,
  AskSource,
} from "@/lib/ask/answer";
import { haptic } from "@/lib/haptics";
import { prefersReducedMotion } from "@/lib/motion";
import { getHomeMuni, getInterests } from "@/lib/personalize";
import {
  getScope,
  parseScope,
  scopeLabel,
  scopeTownSlug,
  setScope,
  subscribeScopeChange,
  type Scope,
} from "@/lib/scope";
import type { TodayPrompt } from "@/lib/today-prompts";
import { track } from "@/lib/track";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { APP_UPDATE_ACCEPTED_EVENT } from "@/lib/pwa-display";
import {
  askResponsePresentation,
  askResponseSectionOrder,
  type AskResponseSection,
} from "@/lib/ask/presentation";
import SaveButton from "@/components/saved/SaveButton";
import CategoryIcon from "@/components/place/CategoryIcon";
import {
  createAskReturnId,
  historyStateWithAskReturn,
  readAskReturnId,
  readAskReturnSnapshot,
  writeAskReturnSnapshot,
  takeAskUpdateDraft,
  writeAskUpdateDraft,
  type AskReturnSnapshot,
} from "@/lib/ask/return-state";

const ASK_CACHE_LIMIT = 24;
const ASK_CACHE_TTL_MS = 45_000;
export const ASK_CLIENT_DEADLINE_MS = 22_000;
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
    query: "Where should I eat tonight?",
  },
  {
    label: "What is on tonight?",
    query: "What is worth doing tonight?",
  },
  {
    label: "Find a restroom",
    query: "Where is the nearest public restroom?",
  },
] as const;

const LOADING_MESSAGE = "Radius is checking current local data and sources.";

type AskCacheEntry = { at: number; result: AskResult };
type AskMode = "compact" | "workspace";
export type AskRequestFailure =
  | "network"
  | "rate-limit"
  | "service"
  | "timeout"
  | "cancelled";
type AskOptions = {
  position?: { lat: number; lng: number } | null;
  scope?: Scope;
  skipNearbyGate?: boolean;
  /** The URL already contains a complete, shareable question. */
  selfContained?: boolean;
};

type ShareStatus = "idle" | "copied" | "shared" | "error";

const askCache = new Map<string, AskCacheEntry>();
const ASK_ABORT_TIMEOUT = "ask-timeout";
const ASK_ABORT_CANCELLED = "ask-cancelled";

export function askFailureForAbortReason(
  reason: unknown,
): Extract<AskRequestFailure, "timeout" | "cancelled"> | null {
  if (reason === ASK_ABORT_TIMEOUT) return "timeout";
  if (reason === ASK_ABORT_CANCELLED) return "cancelled";
  return null;
}

export function scheduleAskDeadline(
  controller: AbortController,
  delayMs = ASK_CLIENT_DEADLINE_MS,
): ReturnType<typeof setTimeout> {
  return globalThis.setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(ASK_ABORT_TIMEOUT);
  }, delayMs);
}

/**
 * Ask permalinks contain only the question. Location, saved places, and taste
 * signals remain in the request body and never become shareable URL data.
 */
export function askQuestionPath(query: string): string {
  const text = query.trim().slice(0, MAX_QUERY_LENGTH);
  return text ? `/ask?q=${encodeURIComponent(text)}` : "/ask";
}

function replaceAskQuestionUrl(query: string, scope?: Scope | null): void {
  if (typeof window === "undefined") return;
  const nextUrl = new URL(askQuestionPath(query), window.location.origin);
  if (scope) nextUrl.searchParams.set("in", scope);
  const next = `${nextUrl.pathname}${nextUrl.search}`;
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

// Inherently-local discovery: "pizza", "coffee", "where can I get tacos". The
// user wants it NEAR them even without saying "near me", so a county-wide
// answer buries the closest option (owner, 2026-07-20: "if the user hasn't
// given location permission, can it ask before answering"). These prompt for
// an area first. Informational / civic / event / weather queries are NOT local
// in this sense and must never be gated.
const LOCAL_DISCOVERY =
  /\b(?:pizza|tacos?|taqueria|sushi|ramen|pho|burgers?|sandwich(?:es)?|bbq|barbecue|wings?|coffee|espresso|latte|cafe|café|brunch|breakfast|lunch|dinner|bakery|bagels?|donuts?|ice cream|gelato|dessert|beer|brewery|breweries|taproom|bars?|cocktails?|wine|winery|cidery|distillery|pub|gastropub|restaurants?|dining|parks?|trails?|hikes?|playground|gym|yoga|museum|thrift|bookstore|bikes?|bicycles?|cycling|ice rink|bowling|arcade|barber|salons?)\b/i;
const LOCAL_PLACE_REQUEST =
  /\b(?:where\s+(?:can|could|should|do)\s+(?:i|we|you)\s+(?:find|get|eat|rent|buy|borrow|visit|go|grab|use|charge|park|pick\s+up)|find\s+me\s+(?:a|an|some))\b/i;
const GENERAL_INFORMATION_MARKERS =
  /\b(?:information|info|instructions?|requirements?|applications?|forms?|websites?|online|rules?|polic(?:y|ies)|laws?|data|statistics?|records?|documents?|budgets?|schedules?)\b/i;
const NON_LOCAL_MARKERS =
  /\b(?:events?|festival|concert|shows?|weather|forecast|rain|snow|pay|bill|register|permit|license|vote|voting|trash|recycl|pothole|how do i|phone number|hours of|contact|county council|schools?|zoning|taxes?|courts?|sheriff|police|government)\b/i;

/** True when a query is an inherently-local place hunt rather than an
 * informational or civic question. Whole county is a valid deliberate scope;
 * the chooser is only needed when no usable scope exists. */
export function queryIsLocalDiscovery(query: string): boolean {
  if (
    NON_LOCAL_MARKERS.test(query) ||
    GENERAL_INFORMATION_MARKERS.test(query)
  ) {
    return false;
  }
  if (LOCAL_DISCOVERY.test(query)) return true;
  return LOCAL_PLACE_REQUEST.test(query);
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
  // In ordinary Frederick conversation, an unqualified "downtown" means
  // downtown Frederick. Check named municipalities first so phrases such as
  // "downtown Brunswick" still keep the town the visitor actually named.
  if (/\b(?:downtown(?:\s+frederick)?|dtf)\b/i.test(query)) {
    return "town:frederick";
  }
  return null;
}

export function hasResolvedNearbyArea(
  scope: Scope | null,
  hasDevicePosition: boolean,
): boolean {
  if (hasDevicePosition) return true;
  return scope === "county" || Boolean(scopeTownSlug(scope));
}

export function nearbyQueryNeedsAreaChoice(
  query: string,
  selectedScope: Scope | null,
  hasDevicePosition: boolean,
): boolean {
  const explicitlyNearby = queryNeedsNearbyContext(query);
  if (!explicitlyNearby && !queryIsLocalDiscovery(query)) return false;
  const explicitScope = explicitAreaInQuery(query);
  // Naming the county in this question is a deliberate area choice. A county
  // value left over from an earlier visit is not precise enough for "near me."
  if (explicitScope === "county") return false;
  if (explicitlyNearby) {
    const effectiveScope = explicitScope ?? selectedScope;
    return !hasDevicePosition && !scopeTownSlug(effectiveScope);
  }
  return !hasResolvedNearbyArea(
    explicitScope ?? selectedScope,
    hasDevicePosition,
  );
}

function activeContextLabel(
  scope: Scope | null,
  hasDevicePosition: boolean,
  homeScope: Scope | null = null,
): string {
  if (scope === "nearme") return scopeLabel(hasDevicePosition ? "nearme" : "county");
  if (scope) return scopeLabel(scope);
  if (hasDevicePosition) return scopeLabel("nearme");
  if (homeScope) return `Ranked from ${scopeLabel(homeScope)}`;
  return scopeLabel("county");
}

function compactContextLabel(label: string): string {
  // The composer chip holds about 60px; "Whole county" keeps its short form.
  if (label === scopeLabel("county")) return "County";
  if (label.startsWith("Ranked from ")) {
    return `Home · ${label.slice("Ranked from ".length).replace(/ City$/, "")}`;
  }
  return label.replace(/ City$/, "");
}

function requestScope(
  query: string,
  selectedScope: Scope | null,
  hasDevicePosition: boolean,
): Scope | null {
  const safeSelectedScope =
    selectedScope === "nearme" && !hasDevicePosition ? null : selectedScope;
  return (
    explicitAreaInQuery(query) ??
    safeSelectedScope ??
    (hasDevicePosition ? "nearme" : null)
  );
}

function storedAskScope(): Scope | null {
  // Home is a ranking fallback, not an explicit browsing filter. Converting
  // it to town:* hard-filtered answers to the saved town and could override a
  // fresh device fix when someone was elsewhere in the county.
  return getScope();
}

/**
 * Ask is a decision surface, so a fresh browser-approved device fix is more
 * useful than an unscoped county default. Keep an explicit whole-county or
 * named-town choice; otherwise reuse the short-lived, on-device fix as Near
 * me. Network/IP estimates never enter this function.
 */
export function preferredAskScope(
  storedScope: Scope | null,
  hasDevicePosition: boolean,
): Scope | null {
  if (!hasDevicePosition || (storedScope && storedScope !== "nearme")) {
    return storedScope;
  }
  return "nearme";
}

function askContextKey(
  scope: Scope | null,
  fallbackHomeScope: Scope | null,
): string {
  return (
    scope ??
    (fallbackHomeScope
      ? `home:${scopeTownSlug(fallbackHomeScope)}`
      : "auto")
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

/**
 * Attach a correction to the ranked entity when Ask names one, without
 * sending the visitor's question or the generated answer to feedback storage.
 */
export function askCorrectionResultRef(
  sources: Array<Pick<AskSource, "href" | "isPrimaryRankedResult">>,
): string | null {
  const source =
    sources.find((candidate) => candidate.isPrimaryRankedResult) ?? sources[0];
  if (!source) return null;
  const target = sourceSaveTarget(source);
  if (!target) return null;
  return `/${target.type === "place" ? "places" : "events"}/${target.id}`;
}

export function askResultHeading(
  result: Pick<AskResult, "intent" | "status">,
  failure: AskRequestFailure | null,
): string {
  if (failure) return "Radius could not complete that request.";
  if (result.status === "empty") return "Radius could not find a solid match.";
  return result.intent?.label ?? "Radius answer";
}

export function askEvidenceLabels(
  source: Partial<
    Pick<AskSource, "href" | "isPrimaryRankedResult" | "status">
  >,
  timeNeed: NonNullable<AskResult["intent"]>["timeNeed"] = null,
): {
  sourceLabel: "Best match" | "Possible match" | "Source";
  explanationLabel: "Why it fits" | "Why it may fit" | "What Radius found";
  hoursLimitation: string | null;
} {
  // AskResult.sources is normally a citation list. Retrieval order alone is
  // not a recommendation contract, so recommendation language requires the
  // server to explicitly identify the ranked primary result.
  if (!source.isPrimaryRankedResult) {
    return {
      sourceLabel: "Source",
      explanationLabel: "What Radius found",
      hoursLimitation: null,
    };
  }

  const timeSensitive = timeNeed === "now" || timeNeed === "tonight";
  const placeResult = source.href?.startsWith("/places/") ?? false;
  const status = source.status?.trim() ?? "";
  const hoursUnknown =
    !status || /\bhours (?:not posted|not confirmed|unconfirmed)\b/i.test(status);
  if (timeSensitive && placeResult && hoursUnknown) {
    return {
      sourceLabel: "Possible match",
      explanationLabel: "Why it may fit",
      hoursLimitation:
        timeNeed === "now"
          ? "Radius has not confirmed that this place is open now. Check before you go."
          : "Radius has not confirmed this place's hours for tonight. Check before you go.",
    };
  }

  return {
    sourceLabel: "Best match",
    explanationLabel: "Why it fits",
    hoursLimitation: null,
  };
}

export function askVisibleRecommendationSummary(
  summary: string | null,
  hoursLimitation: string | null,
): string | null {
  if (!summary || !hoursLimitation) return summary;
  return summary
    .replace(/\bthe best match\b/i, "a possible match")
    .replace(/\bthe strongest match\b/i, "a possible match");
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

export function canDisplayAskSourcePhoto(
  source: Pick<AskSource, "href" | "photo_url">,
): boolean {
  if (!source.photo_url) return false;
  const isGooglePhoto = /\/api\/place-photo|googleusercontent\.com|places\.googleapis\.com/i.test(
    source.photo_url,
  );
  // A compact Google thumbnail may omit its author only when it opens the
  // same photo in a larger, fully attributed place view. Event and external
  // source cards do not provide that path, so they use the designed fallback.
  return !isGooglePhoto || /^\/places\//.test(source.href);
}

function AskSourceCard({
  source,
  index,
  onInternalOpen,
}: {
  source: AskSource;
  index: number;
  onInternalOpen?: (index: number) => void;
}) {
  const external = source.href.startsWith("http");
  const saveTarget = sourceSaveTarget(source);
  const phone = source.phone?.replace(/[^+\d]/g, "");
  const displayPhoto = canDisplayAskSourcePhoto(source);
  const decisionEntity = saveTarget?.type ?? "source";
  const decisionId = saveTarget?.id ?? source.slug;
  const decisionPosition = source.isPrimaryRankedResult ? "lead" : "result";
  const decisionOpenAction =
    sourceOpenLabel(source) === "Directions"
      ? "directions"
      : external
        ? "website"
        : "open";
  return (
    <article
      data-ask-source-index={index}
      data-decision-impression="true"
      data-decision-surface="ask"
      data-decision-entity={decisionEntity}
      data-decision-id={decisionId}
      data-decision-position={decisionPosition}
      className="border-b py-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex items-start gap-3">
        {displayPhoto && source.photo_url ? (
          <div
            data-ask-source-media
            className="relative aspect-square w-[68px] shrink-0 overflow-hidden rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)]"
          >
            <Image
              src={source.photo_url}
              alt=""
              fill
              sizes="68px"
              unoptimized={source.photo_url.startsWith("/api/place-photo")}
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="object-cover"
            />
          </div>
        ) : (
          <span
            data-ask-source-media
            className="flex w-[68px] shrink-0 justify-center pt-[calc(0.8125rem*1.35+4px)]"
            style={{ color: "var(--app-ink-3)" }}
          >
            <CategoryIcon
              slug={source.category}
              className="h-6 w-6"
              strokeWidth={1.75}
            />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p
                className="mb-1 text-[13px] leading-[1.35]"
                style={{ color: "var(--app-ink-2)" }}
              >
                <span className="tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                {" · "}
                {source.eyebrow || source.category}
              </p>
              <Link
                href={source.href}
                data-decision-action={decisionOpenAction}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                onClick={() => {
                  if (!external) onInternalOpen?.(index);
                }}
                className="block font-sans text-[17px] font-semibold leading-snug tracking-[-0.01em] hover:underline hover:decoration-1 hover:underline-offset-[3px]"
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
              className="mt-1 text-[14px] leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              {source.reason}
            </p>
          ) : null}
          {sourceHasDistinctDetail(source) ? (
            <p
              className="mt-1 line-clamp-2 text-[14px] leading-normal"
              style={{ color: "var(--app-ink-2)" }}
            >
              {source.detail}
            </p>
          ) : null}

          <div
            className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]"
            style={{ color: "var(--app-ink-2)" }}
          >
            {typeof source.rating === "number" ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                <Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
                {source.rating.toFixed(1)}
                {source.ratingCount ? (
                  <span className="font-normal">({source.ratingCount.toLocaleString()})</span>
                ) : null}
              </span>
            ) : null}
            {source.distance ? (
              <span className="inline-flex items-center gap-1">
                <Navigation className="h-3.5 w-3.5" aria-hidden />
                {source.distance}
              </span>
            ) : null}
            {source.status ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {source.status}
              </span>
            ) : null}
            {source.city ? <span>{source.city}</span> : null}
          </div>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-5 pl-[80px]">
        <Link
          href={source.href}
          data-decision-action={decisionOpenAction}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          onClick={() => {
            haptic("light");
            if (!external) onInternalOpen?.(index);
          }}
          className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold hover:underline hover:underline-offset-[3px] active:opacity-70"
          style={{ color: "var(--app-link)" }}
        >
          {sourceOpenLabel(source)}
          {external ? (
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </Link>
        {source.email ? (
          <a
            href={`mailto:${source.email}`}
            data-decision-action="email"
            onClick={() => haptic("light")}
            aria-label={`Email ${source.name}`}
            className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold hover:underline hover:underline-offset-[3px] active:opacity-70"
            style={{ color: "var(--app-ink-2)" }}
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Email
          </a>
        ) : null}
        {phone ? (
          <a
            href={`tel:${phone}`}
            data-decision-action="call"
            onClick={() => haptic("light")}
            aria-label={`Call ${source.name} at ${source.phone}`}
            className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold hover:underline hover:underline-offset-[3px] active:opacity-70"
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

function AskPlanCard({
  plan,
  onInternalOpen,
}: {
  plan: AskPlanPreview;
  onInternalOpen?: () => void;
}) {
  return (
    <section
      aria-labelledby="ask-plan-title"
      className="mt-5 border-t pt-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="min-w-0">
        <p
          className="text-[13px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          A route you can edit
        </p>
        <h3
          id="ask-plan-title"
          className="mt-1 font-sans text-[20px] font-bold leading-tight tracking-[-0.02em]"
          style={{ color: "var(--app-ink)" }}
        >
          {plan.title}
        </h3>
        <p
          className="mt-1 text-[14px] leading-normal"
          style={{ color: "var(--app-ink-2)" }}
        >
          {plan.summary}
        </p>
        <p
          className="mt-1 text-[14px] tabular-nums"
          style={{ color: "var(--app-ink-2)" }}
        >
          {plan.dateLabel} · {plan.stops.length} {plan.stops.length === 1 ? "stop" : "stops"}
        </p>
      </div>

      <ol
        data-testid="ask-plan-stops"
        className="mt-3 border-t"
        style={{ borderColor: "var(--app-border)" }}
      >
        {plan.stops.map((stop) => (
          <li
            key={`${stop.order}-${stop.href}`}
            className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-b py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            {stop.photo_url ? (
              <span
                aria-hidden
                className="relative h-11 w-11 overflow-hidden rounded-[var(--app-radius-sm)] bg-[var(--app-bg-sunken)]"
              >
                <Image
                  src={stop.photo_url}
                  alt=""
                  fill
                  unoptimized={stop.photo_url.startsWith("/api/place-photo")}
                  sizes="44px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover"
                />
              </span>
            ) : (
              <span
                aria-hidden
                className="flex h-11 w-11 items-start justify-center pt-0.5"
                style={{ color: "var(--app-ink-3)" }}
              >
                <CategoryIcon
                  slug={stop.category}
                  className="h-6 w-6"
                  strokeWidth={1.75}
                />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-sans text-[17px] font-semibold leading-snug tracking-[-0.01em]">
                  <span
                    className="mr-1.5 tabular-nums"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {stop.order}.
                  </span>
                  <Link
                    href={stop.href}
                    onClick={() => {
                      if (!stop.href.startsWith("http")) onInternalOpen?.();
                    }}
                    className="hover:underline hover:decoration-1 hover:underline-offset-[3px]"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {stop.name}
                  </Link>
                </p>
                <span
                  className="shrink-0 pt-0.5 text-[14px] tabular-nums"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {stop.time}
                </span>
              </div>
              <p
                className="mt-1 text-[14px] leading-normal"
                style={{ color: "var(--app-ink-2)" }}
              >
                {stop.why}
              </p>
              {stop.status || stop.tip ? (
                <div
                  className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {stop.status ? <span>{stop.status}</span> : null}
                  {stop.tip ? <span>{stop.tip}</span> : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <Link
        href={plan.href}
        onClick={() => {
          if (!plan.href.startsWith("http")) onInternalOpen?.();
        }}
        className="group flex min-h-12 items-center justify-between gap-3 border-b text-[14px] font-semibold"
        style={{ borderColor: "var(--app-border)", color: "var(--app-link)" }}
      >
        Open and edit this route
        <ArrowRight
          className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </section>
  );
}

function AskActionList({
  actions,
  label,
  emphasizeFirst = true,
  onRefine,
  onInternalOpen,
}: {
  actions: AskAction[];
  label: string;
  emphasizeFirst?: boolean;
  onRefine: (action: AskAction) => void;
  onInternalOpen: () => void;
}) {
  if (actions.length === 0) return null;
  return (
    <nav aria-label={label} className="mt-5">
      <p
        className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) =>
          action.href ? (
            <Link
              key={`${action.label}-${action.href}`}
              href={action.href}
              target={action.href.startsWith("http") ? "_blank" : undefined}
              rel={action.href.startsWith("http") ? "noopener noreferrer" : undefined}
              onClick={() => {
                if (!action.href?.startsWith("http")) onInternalOpen();
              }}
              className="tap-44 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-md)] border bg-transparent px-3.5 text-[14px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-75"
              style={
                emphasizeFirst && index === 0
                  ? {
                      borderColor: "var(--app-ink)",
                      color: "var(--app-ink)",
                    }
                  : {
                      borderColor: "var(--app-control-border)",
                      color: "var(--app-ink-2)",
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
              onClick={() => onRefine(action)}
              className="tap-44 min-h-11 rounded-[var(--app-radius-md)] border bg-transparent px-3.5 text-[14px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-75"
              style={
                emphasizeFirst && index === 0
                  ? {
                      borderColor: "var(--app-ink)",
                      color: "var(--app-ink)",
                    }
                  : {
                      borderColor: "var(--app-control-border)",
                      color: "var(--app-ink-2)",
                    }
              }
            >
              {action.label}
            </button>
          ),
        )}
      </div>
    </nav>
  );
}

type AreaChooserProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  currentScope: Scope | null;
  geolocationStatus: ReturnType<typeof useGeolocation>["state"]["status"];
  hasDevicePosition: boolean;
  onUseLocation: () => void;
  onChooseScope: (scope: Scope) => void;
  onClose: () => void;
  variant?: "inline" | "sheet";
};

/** A chosen area option reads as selected ink, the same rule as a selected
 * filter chip, so the page keeps its single coral field on the submit. */
function areaOptionStyle(selected: boolean) {
  return selected
    ? {
        borderColor: "var(--app-ink)",
        background: "var(--app-ink)",
        color: "var(--app-bg)",
      }
    : {
        borderColor: "var(--app-control-border)",
        background: "transparent",
        color: "var(--app-ink-2)",
      };
}

function AreaChooser({
  containerRef,
  currentScope,
  geolocationStatus,
  hasDevicePosition,
  onUseLocation,
  onChooseScope,
  onClose,
  variant = "inline",
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
      aria-labelledby={variant === "inline" ? "ask-area-heading" : undefined}
      aria-label={variant === "sheet" ? "Search area options" : undefined}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (variant === "sheet") return;
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
      className={variant === "sheet" ? "outline-none" : "mt-3 border-b pb-4"}
      style={variant === "sheet" ? undefined : { borderColor: "var(--app-border)" }}
    >
      {variant === "inline" ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <p
              id="ask-area-heading"
              className="pt-2.5 text-[17px] font-semibold leading-snug"
              style={{ color: "var(--app-ink)" }}
            >
              Choose where Radius should look.
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close area chooser"
              className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-[var(--app-radius-md)] transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-70"
              style={{ color: "var(--app-ink-3)" }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p
            className="mt-1 text-[14px] leading-normal"
            style={{ color: "var(--app-ink-2)" }}
          >
            Radius uses a device location only after you ask it to. It never
            treats a network location as your precise position.
          </p>
        </>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onUseLocation}
          disabled={geolocationStatus === "loading"}
          aria-pressed={currentScope === "nearme" && hasDevicePosition}
          className="tap-44 inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border px-3 text-[14px] font-semibold transition-colors active:opacity-75 disabled:opacity-55"
          style={areaOptionStyle(currentScope === "nearme" && hasDevicePosition)}
        >
          <LocateFixed className="h-4 w-4" aria-hidden />
          {geolocationStatus === "loading" ? "Finding you…" : "Use my location"}
        </button>
        <button
          type="button"
          onClick={() => onChooseScope("county")}
          aria-pressed={currentScope === "county"}
          className="tap-44 inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border px-3 text-[14px] font-semibold transition-colors active:opacity-75"
          style={areaOptionStyle(currentScope === "county")}
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
        className="mt-4 block text-[13px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Choose a town
        <select
          value={selectedTown}
          onChange={(event) => {
            if (event.target.value) onChooseScope(`town:${event.target.value}`);
          }}
          className="mt-1.5 block min-h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] px-3 text-[16px] font-normal normal-case tracking-normal"
          style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
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
          className="mt-2 text-[14px] leading-normal"
          style={{ color: "var(--app-brand-text)" }}
        >
          Radius could not get a device location. Choose a town or search the
          whole county instead.
        </p>
      ) : null}
    </div>
  );
}

function WorkspaceComposer({
  inputRef,
  areaTriggerRef,
  contextLabel,
  expanded,
  loading,
  compact,
  query,
  onQueryChange,
  onSubmit,
  onCancel,
  onToggleArea,
}: {
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  areaTriggerRef: RefObject<HTMLButtonElement | null>;
  contextLabel: string;
  expanded: boolean;
  loading: boolean;
  compact: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onToggleArea: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    if (query.trim() && !loading) onSubmit();
  };

  const areaControl = (
    <button
      ref={areaTriggerRef}
      type="button"
      onClick={onToggleArea}
      disabled={loading}
      aria-expanded={expanded}
      aria-controls="ask-area-chooser"
      aria-label={`Search area: ${contextLabel}. Change area.`}
      title={contextLabel}
      className="tap-44 inline-flex h-11 min-h-11 min-w-11 max-w-[104px] shrink-0 items-center gap-1 rounded-[var(--app-radius-md)] px-2 text-[13px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-75 disabled:opacity-55"
      style={{ color: "var(--app-ink-2)" }}
    >
      <MapPin className="h-4 w-4 shrink-0" aria-hidden />
      <span className="max-w-[60px] truncate min-[350px]:max-w-[74px]">
        {compactContextLabel(contextLabel)}
      </span>
    </button>
  );

  return (
    <>
      <span id="ask-composer-context" className="sr-only">
        Current search area: {contextLabel}. Add a time, area, budget, or other
        constraint for a more useful answer.
      </span>
      <div className="flex items-center gap-1.5">
        {/* Below 350px the decorative mark gives its width to the field so
            "Ask anything." fits beside the area chip. */}
        {!compact ? (
          <span className="hidden min-[350px]:contents">
            <AskComposerMark compact />
          </span>
        ) : null}
        <textarea
          ref={(node) => {
            inputRef.current = node;
          }}
          value={query}
          readOnly={loading}
          rows={1}
          maxLength={MAX_QUERY_LENGTH}
          enterKeyHint="send"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={compact ? "Ask a follow-up." : "Ask anything."}
          // The placeholder stays on one line, so an empty field never
          // grows to two rows on a narrow phone.
          className={`${ASK_COMPOSER_INPUT_CLASS} min-h-11 px-1.5 py-2 placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap`}
          style={ASK_COMPOSER_INPUT_STYLE}
          aria-label="Ask Radius"
          aria-describedby="ask-composer-context"
        />
        {compact && loading ? (
          <span
            data-ask-inline-status
            className="hidden h-11 shrink-0 items-center gap-1.5 px-1 text-[13px] font-semibold min-[360px]:inline-flex"
            style={{ color: "var(--app-ink-2)" }}
            aria-hidden
          >
            <span
              className="pulse-dot h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--app-brand)" }}
              aria-hidden
            />
            Radius is checking.
          </span>
        ) : (
          areaControl
        )}
        <AskComposerSubmit
          disabled={!query.trim() && !loading}
          loading={loading}
          onCancel={onCancel}
        />
      </div>
    </>
  );
}

/**
 * The wait state holds the space the three starter rows occupied, as three
 * ruled rows, so the page does not jump when the answer arrives. It states one
 * honest fact (local sources are being checked) without inventing
 * step-by-step progress.
 */
function AskWorkingPanel({ contextLabel }: { contextLabel: string }) {
  return (
    <div
      data-ask-working-panel
      className="min-h-[168px] border-t"
      style={{ borderColor: "var(--app-border)" }}
      aria-hidden
    >
      <div
        className="flex min-h-14 items-center gap-3 border-b py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <span
          className="pulse-dot h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--app-brand)" }}
        />
        <span
          className="min-w-0 flex-1 text-[16px] font-medium leading-snug"
          style={{ color: "var(--app-ink)" }}
        >
          {LOADING_MESSAGE}
        </span>
      </div>
      <div
        className="flex min-h-14 items-center border-b py-3 text-[14px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
      >
        <span className="truncate">Local check · {contextLabel}</span>
      </div>
      <div
        className="min-h-14 border-b"
        style={{ borderColor: "var(--app-border)" }}
      />
    </div>
  );
}

type AskFrederickProps = {
  hideLabel?: boolean;
  initialQuery?: string;
  initialScope?: Scope | null;
  mode?: AskMode;
  quickAsks?: TodayPrompt[];
  placeholder?: string;
};

export default function AskFrederick({
  hideLabel = false,
  initialQuery = "",
  initialScope = null,
  mode = "compact",
  quickAsks = QUICK_ASKS,
  placeholder = "Ask for a place, a plan, or what is happening",
}: AskFrederickProps = {}) {
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);
  const [requestFailure, setRequestFailure] =
    useState<AskRequestFailure | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [permalinkQuery, setPermalinkQuery] = useState("");
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [showAllSources, setShowAllSources] = useState(false);
  const [interactionReady, setInteractionReady] = useState(false);
  const [showAreaChooser, setShowAreaChooser] = useState(false);
  const [nearbyGateQuery, setNearbyGateQuery] = useState<string | null>(null);
  const [currentScope, setCurrentScope] = useState<Scope | null>(initialScope);
  const [homeScope, setHomeScope] = useState<Scope | null>(null);
  const [answeredContextKey, setAnsweredContextKey] = useState<string | null>(
    null,
  );
  const [hasCachedPosition, setHasCachedPosition] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const areaChooserRef = useRef<HTMLDivElement | null>(null);
  const areaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const areaSheetScrollRef = useRef<number | null>(null);
  const answerHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);
  const visibleResultRef = useRef<AskResult | null>(null);
  const submittedQueryRef = useRef("");
  const locationRequestPendingRef = useRef(false);
  const approvedLocationCheckRef = useRef(false);
  const pendingNearbyQueryRef = useRef<{
    query: string;
    selfContained: boolean;
  } | null>(null);
  const urlQueryRef = useRef<string | null>(null);
  const skipNextAnswerScrollRef = useRef(false);
  const restorePositionRef = useRef<{
    scrollY: number;
    clickedSourceIndex: number | null;
  } | null>(null);
  const askRef = useRef<(query: string, options?: AskOptions) => Promise<void>>(
    async () => {},
  );
  // One place preference everywhere: signed-in accounts use their synced
  // follows; signed-out visitors transparently retain the device-local saves.
  const { slugs: followedPlaceSlugs } = useFollowedSlugs();
  const geolocation = useGeolocation();
  const refreshGrantedLocation = geolocation.requestIfGranted;
  const workspace = mode === "workspace";
  const hasDevicePosition =
    geolocation.state.status === "granted" || hasCachedPosition;
  const contextLabel = activeContextLabel(
    currentScope,
    hasDevicePosition,
    homeScope,
  );
  visibleResultRef.current = res;
  submittedQueryRef.current = submittedQuery;

  useEffect(() => {
    setInteractionReady(true);
    const cachedPosition = readCachedPosition();
    setCurrentScope(
      initialScope ?? preferredAskScope(storedAskScope(), Boolean(cachedPosition)),
    );
    setHomeScope(parseScope(getHomeMuni()));
    setHasCachedPosition(Boolean(cachedPosition));
    const unsubscribe = subscribeScopeChange((scope) => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setRequestFailure(null);
      setCurrentScope(scope);
    });
    return () => {
      unsubscribe();
      abortRef.current?.abort();
    };
  }, [initialScope]);

  useEffect(() => {
    if (approvedLocationCheckRef.current || readCachedPosition()) return;
    approvedLocationCheckRef.current = true;
    // This never opens a permission prompt. It only refreshes a position when
    // the browser says the visitor already granted geolocation, matching the
    // map's returning-visitor contract.
    void refreshGrantedLocation();
  }, [refreshGrantedLocation]);

  useEffect(() => {
    if (!showAreaChooser) return;
    if (workspace && res) return;
    const frame = window.requestAnimationFrame(() => {
      areaChooserRef.current?.focus({ preventScroll: true });
      areaChooserRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [res, showAreaChooser, workspace]);

  useEffect(() => {
    const scrollY = areaSheetScrollRef.current;
    if (scrollY === null) return;
    let innerFrame: number | null = null;
    const outerFrame = window.requestAnimationFrame(() => {
      // The canonical sheet focuses its first control on entry. Restore the
      // underlying reading position one paint later so opening or closing an
      // area sheet never throws someone back up a long answer.
      innerFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
        if (!showAreaChooser) areaSheetScrollRef.current = null;
      });
    });
    return () => {
      window.cancelAnimationFrame(outerFrame);
      if (innerFrame !== null) window.cancelAnimationFrame(innerFrame);
    };
  }, [showAreaChooser]);

  useEffect(() => {
    if (!workspace) return;
    const node = inputRef.current;
    if (!(node instanceof HTMLTextAreaElement)) return;
    node.style.height = "auto";
    const minHeight = 44;
    const maxHeight = 120;
    // An empty field keeps one line. Otherwise a placeholder that wraps in
    // the narrow 320px field reports a two-line scrollHeight and grows the
    // composer before anyone types.
    const empty = node.value.length === 0;
    const nextHeight = empty
      ? minHeight
      : Math.min(Math.max(node.scrollHeight, minHeight), maxHeight);
    node.style.height = `${nextHeight}px`;
    node.style.overflowY = !empty && node.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [q, res, workspace]);

  useEffect(() => {
    if (!res || loading) return;
    if (skipNextAnswerScrollRef.current) {
      skipNextAnswerScrollRef.current = false;
      const restoration = restorePositionRef.current;
      restorePositionRef.current = null;
      if (!restoration) return;

      let innerFrame: number | null = null;
      const outerFrame = window.requestAnimationFrame(() => {
        // Wait one more paint for an expanded source list to reach its final
        // height before restoring the exact reading position.
        innerFrame = window.requestAnimationFrame(() => {
          window.scrollTo({ top: restoration.scrollY, behavior: "auto" });
          if (restoration.clickedSourceIndex === null) return;
          const card = document.querySelector<HTMLElement>(
            `[data-ask-source-index="${restoration.clickedSourceIndex}"]`,
          );
          card?.querySelector<HTMLElement>("a[href]")?.focus({
            preventScroll: true,
          });
        });
      });
      return () => {
        window.cancelAnimationFrame(outerFrame);
        if (innerFrame !== null) window.cancelAnimationFrame(innerFrame);
      };
    }

    const frame = window.requestAnimationFrame(() => {
      answerHeadingRef.current?.focus({ preventScroll: true });
      answerHeadingRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, res]);

  useEffect(() => {
    if (geolocation.state.status !== "granted") return;
    const pending = pendingNearbyQueryRef.current;
    const wasRequested = locationRequestPendingRef.current;
    if (!pending && !wasRequested) {
      // A fresh browser-approved fix restores Ask's nearby default. Preserve an
      // explicit county or town choice, and never abort a permalink request
      // already in flight.
      setHasCachedPosition(true);
      setCurrentScope((scope) => preferredAskScope(scope, true));
      return;
    }
    locationRequestPendingRef.current = false;
    pendingNearbyQueryRef.current = null;
    setScope("nearme");
    setHasCachedPosition(true);
    setNearbyGateQuery(null);
    setShowAreaChooser(false);
    if (pending) {
      void askRef.current(pending.query, {
        position: geolocation.state.position,
        scope: "nearme",
        skipNearbyGate: true,
        selfContained: pending.selfContained,
      });
    } else {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [geolocation.state]);

  useEffect(() => {
    const retainUpdateDraft = () => {
      try {
        writeAskUpdateDraft(
          window.sessionStorage,
          q,
          new URLSearchParams(window.location.search).get("q") ?? "",
        );
      } catch {
        // Strict privacy modes may block tab storage. The update remains usable.
      }
    };
    window.addEventListener(APP_UPDATE_ACCEPTED_EVENT, retainUpdateDraft);
    return () => window.removeEventListener(APP_UPDATE_ACCEPTED_EVENT, retainUpdateDraft);
  }, [q]);

  useEffect(() => {
    // Next may restore a cached server component when the visitor returns
    // from a source. Read the real browser URL first so a replaced `?q=` is
    // not overwritten by the older server-prop snapshot.
    const browserQuery =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("q") ?? "";
    const text = (browserQuery || initialQuery).trim().slice(0, MAX_QUERY_LENGTH);
    let updateDraft: string | null = null;
    try {
      updateDraft = takeAskUpdateDraft(window.sessionStorage, text);
    } catch {
      // No retained draft when browser storage is unavailable.
    }
    if (updateDraft !== null) setQ(updateDraft);
    // Next's router cache can retain this client instance while restoring a
    // fresh server snapshot on Back. In that case the remembered URL already
    // matches, but the answer state is empty. Let `ask` rehydrate the answer
    // from its bounded cache instead of leaving a question-only workspace.
    if (!text || (urlQueryRef.current === text && visibleResultRef.current)) return;
    urlQueryRef.current = text;

    // A source detail page is part of the same Ask journey. Rehydrate the
    // answer saved on the matching browser-history entry instead of paying
    // for the same request again and throwing the reader back to the top.
    let restored: AskReturnSnapshot<AskResult> | null = null;
    try {
      restored = readAskReturnSnapshot<AskResult>(
        window.sessionStorage,
        window.history.state,
        text,
      );
    } catch {
      // Some privacy modes block access to sessionStorage entirely. The
      // normal bounded request cache remains the fallback in that case.
    }
    const urlScope = parseScope(new URLSearchParams(window.location.search).get("in")) ?? initialScope;
    if (restored && (!urlScope || parseScope(restored.scope) === urlScope)) {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      skipNextAnswerScrollRef.current = true;
      restorePositionRef.current = {
        scrollY: restored.scrollY,
        clickedSourceIndex: restored.clickedSourceIndex,
      };
      lastQueryRef.current = restored.permalinkQuery || text;
      visibleResultRef.current = restored.result;
      setLoading(false);
      setQ(updateDraft ?? restored.draft);
      setSubmittedQuery(restored.submittedQuery);
      setPermalinkQuery(restored.permalinkQuery);
      setRequestFailure(restored.requestFailure);
      setShowAllSources(restored.showAllSources);
      setShowAreaChooser(false);
      setNearbyGateQuery(null);
      const restoredScope = parseScope(restored.scope);
      const restoredHomeScope = parseScope(getHomeMuni());
      setCurrentScope(restoredScope);
      setAnsweredContextKey(
        askContextKey(restoredScope, restoredHomeScope),
      );
      setShareStatus("idle");
      setRes(restored.result);
      return;
    }

    void askRef.current(text, { selfContained: true, scope: urlScope ?? undefined });
    // Rehydrate the submitted question's answer without replacing newer words
    // the visitor was editing when they accepted the application update.
    if (updateDraft !== null) setQ(updateDraft);
  }, [initialQuery, initialScope]);

  async function ask(query: string, options: AskOptions = {}): Promise<void> {
    const text = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (!text) return;
    const contextualQuery = options.selfContained
      ? text
      : contextualizeAskQuery(text, lastQueryRef.current);
    const position = options.position === undefined ? readCachedPosition() : options.position;
    // Keep an unset scope distinct from an explicitly chosen whole-county
    // scope. Local place hunts should ask for an area on a visitor's first
    // request; a person who deliberately chose the county should keep it.
    const selectedScope =
      options.scope ??
      currentScope ??
      preferredAskScope(getScope(), Boolean(position));
    const resolvedScope = requestScope(contextualQuery, selectedScope, Boolean(position));
    // URL questions can run before the mount effect hydrates React state.
    // Reading the browser preference here keeps that first request correctly
    // home-ranked without putting client-only storage into server rendering.
    const fallbackHomeScope = homeScope ?? parseScope(getHomeMuni());
    // "Near me" and "closest" require a real device fix or an area the user
    // deliberately chose. A saved home is enough to rank general discovery,
    // but it is not proof of where the person is standing now.
    const gateScope = queryNeedsNearbyContext(contextualQuery)
      ? selectedScope
      : selectedScope ?? fallbackHomeScope;

    if (
      !options.skipNearbyGate &&
      nearbyQueryNeedsAreaChoice(contextualQuery, gateScope, Boolean(position))
    ) {
      pendingNearbyQueryRef.current = {
        query: text,
        selfContained: Boolean(options.selfContained),
      };
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

    // Keep the answer workspace aligned with the scope that was actually sent
    // to the API. A town named in the question can override the saved county
    // scope for this answer; without this update the results were correctly
    // town-scoped but the UI still called them "county-wide picks."
    setCurrentScope(resolvedScope);

    inputRef.current?.blur();
    // A deliberate county or town choice must survive all the way to the API.
    // Supplying this scope also prevents the Ask surface from falling through
    // to a network-derived ranking origin when no device fix exists.
    const effectiveQuery = contextualQuery;
    urlQueryRef.current = effectiveQuery;
    replaceAskQuestionUrl(effectiveQuery, resolvedScope);
    setPermalinkQuery(effectiveQuery);
    setShareStatus("idle");
    abortRef.current?.abort();
    const requestId = ++requestIdRef.current;
    const savedPlaceSlugs = Array.from(followedPlaceSlugs).slice(0, 30);
    const interests = getInterests().slice(0, 12);
    const fit = readAskFitContext();
    const tasteKey = `${savedPlaceSlugs.slice().sort().join(",")}|${interests
      .slice()
      .sort()
      .join(",")}|${JSON.stringify(fit)}`;
    const cacheScope = askContextKey(resolvedScope, fallbackHomeScope);
    const cacheKey = `${effectiveQuery.toLowerCase()}|${cacheScope}|${
      position ? `${position.lat.toFixed(3)},${position.lng.toFixed(3)}` : "no-fix"
    }|${tasteKey}`;

    setQ(text);
    setRequestFailure(null);
    setNearbyGateQuery(null);
    setShowAreaChooser(false);
    haptic("light");
    track("ask_submit", { surface: workspace ? "workspace" : "compact" });

    const cached = askCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= ASK_CACHE_TTL_MS) {
      setLoading(false);
      setRequestFailure(null);
      setSubmittedQuery(text);
      setShowAllSources(false);
      setAnsweredContextKey(cacheScope);
      setRes(cached.result);
      if (cached.result.status !== "empty") {
        track("ask_answer");
        lastQueryRef.current = effectiveQuery;
      }
      return;
    }
    if (cached) askCache.delete(cacheKey);

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const deadlineId = scheduleAskDeadline(controller);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: effectiveQuery,
          scope: resolvedScope ?? undefined,
          // Block-level precision is enough to rank local results and keeps
          // the browser request aligned with Radius's privacy disclosure.
          lat: position ? Number(position.lat.toFixed(3)) : undefined,
          lng: position ? Number(position.lng.toFixed(3)) : undefined,
          taste: { savedPlaceSlugs, interests },
          fit,
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
        setAnsweredContextKey(cacheScope);
        setRes(next);
        if (next.status !== "empty") {
          track("ask_answer");
          lastQueryRef.current = effectiveQuery;
        } else if (!failure) {
          // The question Radius could not answer IS the roadmap: the query
          // text goes with the event so the dashboard shows what was wanted
          // and missed. Queries here are place-seeking text ("vegan brunch
          // thurmont"), not identity; clamped and case-folded all the same.
          track("ask_empty", { query: effectiveQuery.toLowerCase().slice(0, 80) });
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        const abortFailure = askFailureForAbortReason(controller.signal.reason);
        if (!abortFailure || requestId !== requestIdRef.current) return;
        setRequestFailure(abortFailure);
        setSubmittedQuery(text);
        setShowAllSources(false);
        setAnsweredContextKey(cacheScope);
        setRes(
          errorResult(
            abortFailure === "timeout"
              ? "Radius took too long to answer, but your question is still here if you want to try again."
              : "That request was canceled, and your question is still here if you want to try again.",
          ),
        );
        track(abortFailure === "timeout" ? "ask_timeout" : "ask_cancel");
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === requestIdRef.current) {
        setRequestFailure("network");
        setSubmittedQuery(text);
        setShowAllSources(false);
        setAnsweredContextKey(cacheScope);
        setRes(
          errorResult(
            "Radius could not reach the answer service. Check your connection and try again.",
          ),
        );
      }
    } finally {
      globalThis.clearTimeout(deadlineId);
      if (requestId === requestIdRef.current) {
        setLoading(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  }

  askRef.current = ask;

  function cancelCurrentRequest(): void {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort(ASK_ABORT_CANCELLED);
  }

  function retryLastQuestion(): void {
    const query = (permalinkQuery || submittedQuery).trim();
    if (!query) return;
    void ask(query, {
      scope: currentScope ?? undefined,
      skipNearbyGate: true,
      selfContained: true,
    });
  }

  function chooseScope(nextScope: Scope): void {
    const pending = pendingNearbyQueryRef.current;
    locationRequestPendingRef.current = false;
    pendingNearbyQueryRef.current = null;
    setScope(nextScope);
    setCurrentScope(nextScope);
    setNearbyGateQuery(null);
    setShowAreaChooser(false);
    if (pending) {
      void ask(pending.query, {
        scope: nextScope,
        skipNearbyGate: true,
        selfContained: pending.selfContained,
      });
    } else {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function closeAreaChooser(): void {
    setShowAreaChooser(false);
    window.requestAnimationFrame(() => areaTriggerRef.current?.focus());
  }

  function useDeviceLocation(): void {
    const cached = readCachedPosition();
    if (cached) {
      const pending = pendingNearbyQueryRef.current;
      pendingNearbyQueryRef.current = null;
      setScope("nearme");
      setCurrentScope("nearme");
      setHasCachedPosition(true);
      setNearbyGateQuery(null);
      setShowAreaChooser(false);
      if (pending) {
        void ask(pending.query, {
          position: cached,
          scope: "nearme",
          skipNearbyGate: true,
          selfContained: pending.selfContained,
        });
      } else {
        window.requestAnimationFrame(() => inputRef.current?.focus());
      }
      return;
    }
    locationRequestPendingRef.current = true;
    geolocation.request();
  }

  /** Localize the answer ALREADY on screen: re-run the on-screen query with the
   *  user's location so proximity ranking applies. The bike-rental miss
   *  (owner, 2026-07-20): a query without "near me" wording never offered
   *  location, so Ask answered county-wide and buried the closest option.
   *  Reuses the device-location path; the pending-query ref makes the grant
   *  (or a cached fix) re-run THIS query. */
  function localizeAnswer(): void {
    if (!submittedQuery) return;
    const effectiveQuery = (permalinkQuery || submittedQuery).trim();
    if (!effectiveQuery) return;
    const cached = readCachedPosition();
    if (cached) {
      setScope("nearme");
      setCurrentScope("nearme");
      setHasCachedPosition(true);
      void ask(effectiveQuery, {
        position: cached,
        scope: "nearme",
        skipNearbyGate: true,
        selfContained: true,
      });
      return;
    }
    // No cached fix: request the device location. On grant, the geolocation
    // effect re-runs this pending query with the position and re-ranks.
    pendingNearbyQueryRef.current = {
      query: effectiveQuery,
      selfContained: true,
    };
    locationRequestPendingRef.current = true;
    geolocation.request();
  }

  function runAction(action: AskAction): void {
    if (action.query) void ask(action.query);
  }

  function runIntent(query: string): void {
    setQ(query);
    void ask(query);
  }

  function rememberAskReturn(index: number | null): void {
    if (!res || typeof window === "undefined") return;
    const browserQuery =
      new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
    const query = (browserQuery || permalinkQuery || submittedQuery)
      .trim()
      .slice(0, MAX_QUERY_LENGTH);
    if (!query) return;

    const id = readAskReturnId(window.history.state) ?? createAskReturnId();
    let saved = false;
    try {
      saved = writeAskReturnSnapshot(window.sessionStorage, {
        version: 1,
        id,
        savedAt: Date.now(),
        query,
        draft: q,
        submittedQuery,
        permalinkQuery: permalinkQuery || query,
        result: res,
        requestFailure,
        showAllSources,
        scope: currentScope,
        scrollY: window.scrollY,
        clickedSourceIndex: index,
      });
    } catch {
      return;
    }
    if (!saved) return;

    try {
      window.history.replaceState(
        historyStateWithAskReturn(window.history.state, id),
        "",
        window.location.href,
      );
    } catch {
      // The detail link still works; only enhanced return-state is omitted.
    }
  }

  async function shareQuestion(): Promise<void> {
    const query = permalinkQuery.trim();
    if (!query || typeof window === "undefined") return;
    const shareUrl = new URL(askQuestionPath(query), window.location.origin);
    if (currentScope) shareUrl.searchParams.set("in", currentScope);
    const url = shareUrl.toString();

    // Share the ANSWER when one is on screen, not just the question. A
    // plan texted to a friend only works if the plan itself rides in the
    // message (owner ask, 2026-07-18: "text or email plans that are
    // made"). The permalink still comes along for the tap-through; the
    // question alone remains the fallback while an answer is loading.
    const answer = res?.answer?.trim() ?? "";
    const shareHoursLimitation = res?.sources[0]
      ? askEvidenceLabels(
          res.sources[0],
          res.intent?.timeNeed ?? null,
        ).hoursLimitation
      : null;
    const answerWithHoursContext =
      shareHoursLimitation && !answer.includes(shareHoursLimitation)
        ? `${answer} ${shareHoursLimitation}`.trim()
        : answer;
    const shareText =
      answerWithHoursContext.length > 600
        ? `${answerWithHoursContext.slice(0, 597).trimEnd()}…`
        : answerWithHoursContext || query;

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

  const responsePresentation = res
    ? res.presentation ?? askResponsePresentation(res)
    : null;
  const responseSections: AskResponseSection[] = responsePresentation
    ? askResponseSectionOrder(responsePresentation)
    : [];
  const leadSource = res?.sources[0] ?? null;
  const correctionResultRef = res
    ? askCorrectionResultRef(res.sources)
    : null;
  const evidenceLabels = leadSource
    ? askEvidenceLabels(leadSource, res?.intent?.timeNeed ?? null)
    : null;
  const visibleSummary = responsePresentation
    ? askVisibleRecommendationSummary(
        responsePresentation.summary,
        evidenceLabels?.hoursLimitation ?? null,
      )
    : null;
  const supportingSources = res?.sources.slice(1) ?? [];
  const collapsedSourceCount = responsePresentation?.layout === "place" ? 3 : 2;
  const collapsedSupportingCount = Math.max(
    0,
    collapsedSourceCount - (leadSource ? 1 : 0),
  );
  const visibleSources = supportingSources.slice(
    0,
    showAllSources ? undefined : collapsedSupportingCount,
  );
  const resultActions = (res?.actions ?? []).filter(
    (action) => !res?.plan || action.href !== res.plan.href,
  );
  const primaryAction = resultActions.slice(0, 1);
  const secondaryActions = resultActions.slice(1);
  // Offer to localize a county-wide place answer: the answer named real places
  // but Radius has no location and no town is set, so the closest option can't
  // lead. A one-tap prompt re-ranks by proximity (the bike-rental miss fix).
  const canLocalizeAnswer = answerCanLocalize({
    hasResult: Boolean(res),
    requestFailure: Boolean(requestFailure),
    hasPlaceMatch: (res?.sources ?? []).some((s) => s.href.startsWith("/places/")),
    hasDevicePosition,
    townScoped: Boolean(scopeTownSlug(currentScope)),
    hasQuery: Boolean(submittedQuery),
  });
  const answerNeedsAreaRefresh = Boolean(
    res &&
      submittedQueryRef.current &&
      !explicitAreaInQuery(submittedQueryRef.current) &&
      answeredContextKey &&
      answeredContextKey !== askContextKey(currentScope, homeScope),
  );

  return (
    <section
      aria-labelledby={workspace ? "ask-radius-heading" : undefined}
      data-ask-interaction-ready={interactionReady ? "true" : "false"}
      // Left-aligned with the shell so the title and rows share Back's and
      // the footer's edge on desktop instead of a second centered edge.
      className={workspace ? "max-w-[760px]" : undefined}
    >
      {workspace ? (
        <header className="mb-4 max-w-[660px]">
          <h1
            id="ask-radius-heading"
            className="text-[32px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Ask Radius.
          </h1>
        </header>
      ) : !hideLabel ? (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p
            className="flex items-center gap-1 text-[13px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            <AskComposerMark compact />
            Ask Radius
          </p>
          <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            Answers use Radius listings and cited local sources.
          </p>
        </div>
      ) : null}

      <div
        data-ask-composer-dock={workspace && res ? "sticky" : undefined}
        className={
          workspace && res
            ? "sticky top-[var(--app-topbar-offset)] z-[var(--z-raised)] -mx-2 border-b bg-[var(--app-bg)] px-2 py-2"
            : undefined
        }
        style={
          workspace && res ? { borderColor: "var(--app-border)" } : undefined
        }
      >
        <form
          role="search"
          aria-label="Ask Radius"
          aria-busy={loading}
          onSubmit={(event) => {
            event.preventDefault();
            void ask(q);
          }}
          className={workspace ? undefined : "mt-2"}
        >
          <AskComposerFrame
            compact
            className={workspace ? undefined : "flex items-center gap-2"}
          >
            {workspace ? (
              <WorkspaceComposer
                inputRef={inputRef}
                areaTriggerRef={areaTriggerRef}
                contextLabel={contextLabel}
                expanded={showAreaChooser}
                loading={loading}
                compact={Boolean(res)}
                query={q}
                onQueryChange={setQ}
                onSubmit={() => void ask(q)}
                onCancel={cancelCurrentRequest}
                onToggleArea={() => {
                  if (!showAreaChooser && workspace && res) {
                    areaSheetScrollRef.current = window.scrollY;
                  }
                  setShowAreaChooser((open) => !open);
                }}
              />
            ) : (
              <>
                <AskComposerMark compact />
                <input
                  ref={(node) => {
                    inputRef.current = node;
                  }}
                  value={q}
                  readOnly={loading}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder={
                    res ? "Ask for something closer or different." : placeholder
                  }
                  className={`${ASK_COMPOSER_INPUT_CLASS} h-11`}
                  style={ASK_COMPOSER_INPUT_STYLE}
                  aria-label="Ask Radius"
                />
                <AskComposerSubmit
                  disabled={!q.trim() && !loading}
                  loading={loading}
                  onCancel={cancelCurrentRequest}
                />
              </>
            )}
          </AskComposerFrame>
        </form>

        {showAreaChooser && !(workspace && res) ? (
          <AreaChooser
            containerRef={areaChooserRef}
            currentScope={currentScope}
            geolocationStatus={geolocation.state.status}
            hasDevicePosition={hasDevicePosition}
            onUseLocation={useDeviceLocation}
            onChooseScope={chooseScope}
            onClose={closeAreaChooser}
          />
        ) : null}

        {nearbyGateQuery ? (
          <div
            role="status"
            className="mt-3 border-b pb-3"
            style={{
              borderColor: "var(--app-border)",
              color: "var(--app-ink-2)",
            }}
          >
            <p className="text-[17px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
              Radius needs a real area for that question.
            </p>
            <p className="mt-1 text-[14px] leading-normal">
              Use your device location or choose a town from the area control.
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
                className="tap-44 min-h-11 shrink-0 rounded-[var(--app-radius-md)] border px-3 text-[14px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-75 disabled:opacity-45"
                style={{
                  borderColor: "var(--app-control-border)",
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

      <Sheet
        open={Boolean(showAreaChooser && workspace && res)}
        onClose={closeAreaChooser}
        title="Search area"
        subtitle="Use your location for nearby answers, or choose a town."
        maxHeight="70dvh"
      >
        <AreaChooser
          containerRef={areaChooserRef}
          currentScope={currentScope}
          geolocationStatus={geolocation.state.status}
          hasDevicePosition={hasDevicePosition}
          onUseLocation={useDeviceLocation}
          onChooseScope={chooseScope}
          onClose={closeAreaChooser}
          variant="sheet"
        />
      </Sheet>

      {workspace && !res && !nearbyGateQuery ? (
        <section
          aria-labelledby="ask-start-heading"
          className="mt-5"
          data-ask-empty-state
        >
          <div className="flex min-h-11 items-center justify-between gap-3">
            <h2
              id="ask-start-heading"
              className="text-[13px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {loading ? "Checking Frederick" : "Questions to try"}
            </h2>
            {!loading ? (
              <Link
                href="/compass"
                className="tap-44 inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold hover:underline hover:underline-offset-[3px]"
                style={{ color: "var(--app-link)" }}
              >
                Browse tools
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : (
              <span
                className="max-w-[45%] truncate text-right text-[13px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {contextLabel}
              </span>
            )}
          </div>
          {loading ? (
            <AskWorkingPanel contextLabel={contextLabel} />
          ) : (
            <div
              className="border-t"
              style={{ borderColor: "var(--app-border)" }}
              role="group"
              aria-label="Questions to try"
            >
              {WORKSPACE_ASKS.map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  onClick={() => runIntent(prompt.query)}
                  // The last row drops its rule: the footer's top rule is
                  // the one separator below the list.
                  className="group flex min-h-14 w-full items-center justify-between gap-3 border-b text-left text-[16px] font-medium leading-snug transition-colors last:border-b-0 active:bg-[var(--app-bg-sunken)]"
                  style={{
                    borderColor: "var(--app-border)",
                    color: "var(--app-ink)",
                  }}
                >
                  <span className="group-hover:underline group-hover:decoration-1 group-hover:underline-offset-[3px]">
                    {prompt.label}
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--app-ink-3)" }}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <div>
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {loading ? "Radius is working on your question." : ""}
        </span>
        {loading && !workspace ? (
          <div
            className="mt-3 border-b py-3"
            style={{
              color: "var(--app-ink-2)",
              borderColor: "var(--app-border)",
            }}
          >
            <div className="flex min-w-0 items-center gap-2.5 text-[14px] font-medium">
              <span
                className="pulse-dot h-2 w-2 shrink-0 rounded-full"
                style={{ background: "var(--app-brand)" }}
                aria-hidden
              />
              <span>{LOADING_MESSAGE}</span>
            </div>
          </div>
        ) : null}
      </div>

      {res && responsePresentation ? (
        <div
          key={`${res.status}:${res.answer?.slice(0, 80) ?? "answer"}`}
          inert={loading ? true : undefined}
          className={`ask-answer-arrival ${workspace ? "mt-4" : "mt-3 border-t pt-3"} transition-opacity ${loading ? "opacity-80" : ""}`}
          style={!workspace ? { borderColor: "var(--app-border)" } : undefined}
        >
          <section
            aria-labelledby="ask-answer-heading"
            className={workspace ? "pt-2" : undefined}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2
                ref={answerHeadingRef}
                id="ask-answer-heading"
                tabIndex={-1}
                className={
                  workspace
                    ? "font-sans text-[22px] font-bold leading-tight tracking-[-0.02em]"
                    : "text-[17px] font-semibold leading-snug"
                }
                style={{ color: "var(--app-ink)" }}
              >
                {askResultHeading(res, requestFailure)}
              </h2>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {res.context ? (
                  <span
                    className="inline-flex items-center gap-1 text-[14px]"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {res.context}
                  </span>
                ) : null}
                {workspace && permalinkQuery ? (
                  <button
                    type="button"
                    onClick={() => void shareQuestion()}
                    className="tap-44 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-md)] px-2 text-[14px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-75"
                    style={{ color: "var(--app-link)" }}
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
            {responseSections.map((section) => {
              if (section === "summary") {
                return visibleSummary ? (
                  <p
                    key={section}
                    data-ask-section={section}
                    className="whitespace-pre-wrap text-[16px] leading-[1.58] sm:text-[17px]"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {visibleSummary}
                  </p>
                ) : null;
              }

              if (section === "context-controls") {
                if (!answerNeedsAreaRefresh && !canLocalizeAnswer) return null;
                return (
                  <div key={section} data-ask-section={section}>
                    {answerNeedsAreaRefresh ? (
                      <button
                        type="button"
                        onClick={() => {
                          void ask(submittedQueryRef.current, {
                            scope: currentScope ?? undefined,
                            skipNearbyGate: true,
                            selfContained: true,
                          });
                        }}
                        className="group mt-3 flex min-h-14 w-full items-center gap-3 border-y py-3 text-left transition-colors active:bg-[var(--app-bg-sunken)]"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <MapPin
                          className="h-4 w-4 shrink-0"
                          strokeWidth={2.2}
                          style={{ color: "var(--app-link)" }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className="block text-[17px] font-semibold leading-snug group-hover:underline group-hover:decoration-1 group-hover:underline-offset-[3px]"
                            style={{ color: "var(--app-ink)" }}
                          >
                            Your answer is still here.
                          </span>
                          <span
                            className="mt-0.5 block text-[14px] leading-snug"
                            style={{ color: "var(--app-ink-2)" }}
                          >
                            Update it for {contextLabel}.
                          </span>
                        </span>
                        <ArrowRight
                          className="h-4 w-4 shrink-0"
                          strokeWidth={2.2}
                          style={{ color: "var(--app-link)" }}
                          aria-hidden
                        />
                      </button>
                    ) : null}
                    {canLocalizeAnswer ? (
                      <button
                        type="button"
                        onClick={localizeAnswer}
                        disabled={geolocation.state.status === "loading"}
                        className="group mt-3 flex min-h-14 w-full items-center gap-3 border-y py-3 text-left transition-colors active:bg-[var(--app-bg-sunken)] disabled:opacity-60"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <LocateFixed
                          className="h-4 w-4 shrink-0"
                          strokeWidth={2.2}
                          style={{ color: "var(--app-link)" }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className="block text-[17px] font-semibold leading-snug group-hover:underline group-hover:decoration-1 group-hover:underline-offset-[3px]"
                            style={{ color: "var(--app-ink)" }}
                          >
                            {geolocation.state.status === "loading"
                              ? "Finding you…"
                              : "These are county-wide picks."}
                          </span>
                          <span
                            className="mt-0.5 block text-[14px] leading-snug"
                            style={{ color: "var(--app-ink-2)" }}
                          >
                            Share your location to put the closest ones first.
                          </span>
                        </span>
                        <ArrowRight
                          className="h-4 w-4 shrink-0"
                          strokeWidth={2.2}
                          style={{ color: "var(--app-link)" }}
                          aria-hidden
                        />
                      </button>
                    ) : null}
                  </div>
                );
              }

              if (section === "plan") {
                return res.plan ? (
                  <div key={section} data-ask-section={section}>
                    <AskPlanCard
                      plan={res.plan}
                      onInternalOpen={() => rememberAskReturn(null)}
                    />
                  </div>
                ) : null;
              }

              if (section === "primary-source") {
                return leadSource ? (
                  <div
                    key={section}
                    data-ask-section={section}
                    className="mt-5"
                  >
                    <p
                      className="border-b pb-2 text-[13px] font-semibold uppercase tracking-[0.08em]"
                      style={{
                        borderColor: "var(--app-border)",
                        color: "var(--app-brand-text)",
                      }}
                    >
                      {responsePresentation.layout === "civic"
                        ? "Official source"
                        : evidenceLabels?.sourceLabel}
                    </p>
                    {evidenceLabels?.hoursLimitation ? (
                      <p
                        data-ask-hours-limitation
                        className="flex items-start gap-2 border-b py-2.5 text-[14px] font-medium leading-snug"
                        style={{
                          borderColor: "var(--app-border)",
                          color: "var(--app-ink-2)",
                        }}
                      >
                        <Clock3
                          className="mt-0.5 h-4 w-4 shrink-0"
                          style={{ color: "var(--app-warning)" }}
                          aria-hidden
                        />
                        <span>{evidenceLabels.hoursLimitation}</span>
                      </p>
                    ) : null}
                    <AskSourceCard
                      source={leadSource}
                      index={0}
                      onInternalOpen={rememberAskReturn}
                    />
                  </div>
                ) : null;
              }

              if (section === "primary-action") {
                if (requestFailure) {
                  return (
                    <button
                      key={section}
                      data-ask-section={section}
                      type="button"
                      onClick={retryLastQuestion}
                      className="tap-44 mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border px-4 text-[14px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-75"
                      style={{
                        borderColor: "var(--app-ink)",
                        color: "var(--app-ink)",
                      }}
                    >
                      Try again
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  );
                }
                if (
                  responsePresentation.layout === "recovery" &&
                  primaryAction.length === 0
                ) {
                  return (
                    <button
                      key={section}
                      data-ask-section={section}
                      type="button"
                      onClick={() => inputRef.current?.focus()}
                      className="tap-44 mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border px-4 text-[14px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-75"
                      style={{
                        borderColor: "var(--app-ink)",
                        color: "var(--app-ink)",
                      }}
                    >
                      Change the question
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  );
                }
                return (
                  <div key={section} data-ask-section={section}>
                    <AskActionList
                      actions={primaryAction}
                      label={
                        responsePresentation.layout === "civic"
                          ? "Do this now"
                          : "Next step"
                      }
                      onRefine={runAction}
                      onInternalOpen={() => rememberAskReturn(null)}
                    />
                  </div>
                );
              }

              if (section === "supporting-sources") {
                return supportingSources.length > 0 ? (
                  <details
                    key={section}
                    data-ask-section={section}
                    open={
                      responsePresentation.layout === "place"
                        ? true
                        : undefined
                    }
                    className="group mt-6 border-t"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
                      <span
                        className="text-[17px] font-semibold leading-snug"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {responsePresentation.layout === "place"
                          ? "Other options and sources"
                          : responsePresentation.layout === "civic"
                            ? "More official sources"
                            : "Sources behind this answer"}
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-2 text-[14px] tabular-nums"
                        style={{ color: "var(--app-ink-2)" }}
                      >
                        {supportingSources.length}{" "}
                        {supportingSources.length === 1 ? "source" : "sources"}
                        <ChevronDown
                          className="h-4 w-4 motion-safe:transition-transform group-open:rotate-180"
                          strokeWidth={2.2}
                          aria-hidden
                        />
                      </span>
                    </summary>
                    <div
                      className="border-t pb-1"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <div>
                        {visibleSources.map((source, index) => (
                          <AskSourceCard
                            key={`${source.category}-${source.slug}-${source.href}`}
                            source={source}
                            index={index + 1}
                            onInternalOpen={rememberAskReturn}
                          />
                        ))}
                      </div>
                      {supportingSources.length > collapsedSupportingCount ? (
                        <button
                          type="button"
                          onClick={() => setShowAllSources((value) => !value)}
                          className="tap-44 mt-3 flex min-h-11 w-full items-center justify-center rounded-[var(--app-radius-md)] border text-[14px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-75"
                          style={{
                            borderColor: "var(--app-control-border)",
                            color: "var(--app-link)",
                          }}
                        >
                          {showAllSources
                            ? "Show fewer sources"
                            : `Show all ${supportingSources.length} sources`}
                        </button>
                      ) : null}
                    </div>
                  </details>
                ) : null;
              }

              if (section === "secondary-actions") {
                return (
                  <div key={section} data-ask-section={section}>
                    <AskActionList
                      actions={secondaryActions}
                      label="Other next steps"
                      emphasizeFirst={false}
                      onRefine={runAction}
                      onInternalOpen={() => rememberAskReturn(null)}
                    />
                  </div>
                );
              }

              if (section === "detail") {
                return responsePresentation.detail ? (
                  <div
                    key={section}
                    data-ask-section={section}
                    className="mt-6 border-t pt-3"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <p
                      className="text-[13px] font-semibold uppercase tracking-[0.08em]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      More context
                    </p>
                    <p
                      className="mt-1.5 whitespace-pre-wrap text-[15px] leading-[1.58]"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      {responsePresentation.detail}
                    </p>
                  </div>
                ) : null;
              }

              return null;
            })}

            {!requestFailure && res.status !== "empty" && res.answer?.trim() ? (
              <AskCorrectionControl
                key={`ask-correction-${requestIdRef.current}`}
                resultRef={correctionResultRef}
              />
            ) : null}
          </section>

          <div className="mt-4 flex justify-end">
            <Link
              href="/compass"
              className="tap-44 inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold hover:underline hover:underline-offset-[3px]"
              style={{ color: "var(--app-link)" }}
            >
              Browse tools
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}

    </section>
  );
}
