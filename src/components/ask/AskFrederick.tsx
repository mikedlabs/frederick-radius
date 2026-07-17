"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  Clock3,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Sparkles,
} from "lucide-react";
import { track } from "@/lib/track";
import { haptic } from "@/lib/haptics";
import type { AskAction, AskPlanPreview, AskResult, AskSource } from "@/lib/ask/answer";
import { readCachedPosition } from "@/hooks/useGeolocation";
import { useSavedList } from "@/hooks/useSaved";
import { getInterests } from "@/lib/personalize";
import { getScope, scopeInSentence, scopeLabel, subscribeScopeChange, type Scope } from "@/lib/scope";
import { contextualizeAskQuery } from "@/lib/ask/followup";
import type { TodayPrompt } from "@/lib/today-prompts";

const ASK_CACHE_LIMIT = 24;
const ASK_CACHE_TTL_MS = 45_000;
const QUICK_ASKS = [
  { label: "Breakfast nearby", query: "Where can I get a good breakfast sandwich near me?" },
  { label: "Build a date night", query: "Plan a walkable 3 hour date night" },
  { label: "One easy afternoon", query: "Plan an easy 3 hour afternoon, surprise me" },
  { label: "What’s on tonight", query: "What events are happening tonight?" },
];

type AskCacheEntry = { at: number; result: AskResult };
const askCache = new Map<string, AskCacheEntry>();

function cacheAskResult(key: string, result: AskResult) {
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

function SourceRow({ source, index }: { source: AskSource; index: number }) {
  const external = source.href.startsWith("http");
  return (
    <Link
      href={source.href}
      onClick={() => haptic("light")}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="group grid min-h-[68px] grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 border-b py-2.5 last:border-b-0 active:opacity-70"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span className="font-mono text-[10px] font-semibold tabular-nums" style={{ color: "var(--app-ink-3)" }}>{String(index + 1).padStart(2, "0")}</span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-brand-press)" }}>{source.eyebrow || source.category}</span>
        <span className="mt-0.5 block truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{source.name}</span>
        {source.reason ? <span className="mt-0.5 line-clamp-1 block text-[11.5px]" style={{ color: "var(--app-ink-2)" }}>{source.reason}</span> : null}
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
          {source.distance ? <span className="inline-flex items-center gap-1"><Navigation className="h-3 w-3" aria-hidden />{source.distance}</span> : null}
          {source.status ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden />{source.status}</span> : null}
          {source.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden />{source.phone}</span> : null}
        </span>
      </span>
      {external ? <ExternalLink className="h-4 w-4 shrink-0 opacity-35" aria-hidden /> : <ArrowRight className="h-4 w-4 shrink-0 opacity-35 transition-transform group-hover:translate-x-0.5" aria-hidden />}
    </Link>
  );
}

function PlanPreview({ plan }: { plan: AskPlanPreview }) {
  return (
    <div className="mt-3 overflow-hidden rounded-[14px] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)" }}>
      <div className="flex items-start justify-between gap-3 border-b px-3.5 py-3" style={{ borderColor: "var(--app-border)" }}>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>Your route</p>
          <h3 className="mt-0.5 truncate text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>{plan.title}</h3>
          <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>{plan.summary}</p>
        </div>
        <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>{plan.stops.length} stops</span>
      </div>
      <ol data-testid="ask-plan-stops" className="px-3.5 py-1">
        {plan.stops.map((stop, index) => (
          <li key={`${stop.order}-${stop.href}`} className="relative grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 border-b py-2.5 last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
            {index < plan.stops.length - 1 ? <span className="absolute bottom-[-5px] left-[11px] top-[30px] w-px" style={{ background: "var(--app-border)" }} aria-hidden /> : null}
            <span className="relative z-10 grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold" style={{ background: "var(--app-bg-sunken)", color: "var(--app-brand-press)" }}>{stop.order}</span>
            <Link href={stop.href} className="min-w-0 truncate text-[13px] font-semibold hover:underline" style={{ color: "var(--app-ink)" }}>{stop.name}</Link>
            <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>{stop.time}</span>
          </li>
        ))}
      </ol>
      <Link href={plan.href} className="group flex min-h-11 items-center justify-between border-t px-3.5 text-[12px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}>
        Open and edit route
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

type AskFrederickProps = {
  hideLabel?: boolean;
  quickAsks?: TodayPrompt[];
  placeholder?: string;
};

function activeContextLabel(scope: Scope | null): string {
  if (scope === "nearme" && readCachedPosition()) return "Near your location";
  if (scope) return scopeLabel(scope);
  return readCachedPosition() ? "Near your location" : "Whole county";
}

export default function AskFrederick({ hideLabel = false, quickAsks = QUICK_ASKS, placeholder = "Ask for a place, a plan, or what’s happening" }: AskFrederickProps = {}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);
  const [showAllSources, setShowAllSources] = useState(false);
  const [contextLabel, setContextLabel] = useState("Whole county");
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);
  const saved = useSavedList();

  useEffect(() => {
    setContextLabel(activeContextLabel(getScope()));
    const unsubscribe = subscribeScopeChange((scope) => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      lastQueryRef.current = null;
      setLoading(false);
      setRes(null);
      setContextLabel(activeContextLabel(scope));
    });
    return () => {
      unsubscribe();
      abortRef.current?.abort();
    };
  }, []);

  async function ask(query: string) {
    const text = query.trim();
    if (!text) return;
    const effectiveQuery = contextualizeAskQuery(text, lastQueryRef.current);
    abortRef.current?.abort();
    const requestId = ++requestIdRef.current;
    const position = readCachedPosition();
    const scope = getScope();
    const savedPlaceSlugs = saved.filter((item) => item.type === "place").map((item) => item.id).slice(0, 30);
    const interests = getInterests().slice(0, 12);
    const tasteKey = `${savedPlaceSlugs.slice().sort().join(",")}|${interests.slice().sort().join(",")}`;
    const cacheKey = `${effectiveQuery.toLowerCase()}|${scope ?? "no-scope"}|${position ? `${position.lat.toFixed(3)},${position.lng.toFixed(3)}` : "no-fix"}|${tasteKey}`;
    setQ(text);
    setRes(null);
    setShowAllSources(false);
    haptic("light");
    track("ask_submit");

    const cached = askCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= ASK_CACHE_TTL_MS) {
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
          scope: scope ?? undefined,
          lat: position ? Number(position.lat.toFixed(4)) : undefined,
          lng: position ? Number(position.lng.toFixed(4)) : undefined,
          taste: { savedPlaceSlugs, interests },
        }),
        signal: controller.signal,
      });

      let next: AskResult;
      if (response.status === 429) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        next = errorResult(body.message ?? "Too many questions. Give it a moment.");
      } else if (!response.ok) {
        next = errorResult("Radius couldn’t answer just now. Try again in a minute.");
      } else {
        next = (await response.json()) as AskResult;
        cacheAskResult(cacheKey, next);
      }
      if (requestId === requestIdRef.current) {
        setRes(next);
        if (next.status !== "empty") {
          lastQueryRef.current = effectiveQuery;
          setQ("");
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === requestIdRef.current) setRes(errorResult("Radius couldn’t reach the answer service. Check your connection and try again."));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  }

  function runAction(action: AskAction) {
    if (action.query) void ask(action.query);
  }

  return (
    <div>
      {!hideLabel ? (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}><Sparkles className="h-4 w-4" aria-hidden /> Ask Radius</p>
          <p className="text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>Real places. Real hours.</p>
        </div>
      ) : null}

      <p className="mb-2 inline-flex items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
        <MapPin className="h-3 w-3" aria-hidden /> Searching {scopeInSentence(contextLabel)}
      </p>

      <form
        onSubmit={(event) => { event.preventDefault(); void ask(q); }}
        className="flex items-center gap-2 rounded-[14px] border bg-[var(--app-bg-elevated-solid)] py-1 pl-4 pr-1.5"
        style={{ borderColor: "var(--app-border-strong, var(--app-border))", boxShadow: "var(--app-elev-1)" }}
      >
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={res ? "Follow up: closer, cheaper, tomorrow…" : placeholder}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--app-ink-3)]"
          style={{ color: "var(--app-ink)" }}
          aria-label="Ask Frederick Radius"
        />
        <button type="submit" disabled={!q.trim() || loading} aria-label="Ask Radius" className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] transition active:scale-95 disabled:opacity-35" style={{ background: "var(--app-brand)", color: "var(--app-on-brand, #fff)" }}>
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      </form>

      {quickAsks.length > 0 ? <div className="mt-2 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Ideas to ask Radius">
          {quickAsks.slice(0, 3).map((prompt) => (
            <button key={prompt.label} type="button" onClick={() => void ask(prompt.query)} disabled={loading} className="min-h-8 shrink-0 rounded-full border px-2.5 text-[10.5px] font-semibold transition active:scale-[0.98] disabled:opacity-45" style={{ borderColor: "var(--app-border)", background: "transparent", color: "var(--app-ink-2)" }}>
              {prompt.label}
            </button>
          ))}
        </div>
      </div> : null}

      <div aria-live="polite">
        {loading ? (
          <div className="mt-3 flex items-center gap-2.5 border-l-2 px-3 py-2 text-[12px]" style={{ color: "var(--app-ink-2)", borderColor: "var(--app-brand)", background: "var(--app-bg-sunken)" }}>
            <span className="pulse-dot h-2 w-2 rounded-full" style={{ background: "var(--app-brand)" }} aria-hidden />
            Checking fit, distance, and hours…
          </div>
        ) : null}

        {res && !loading ? (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
            <p className="text-[13.5px] leading-[1.55]" style={{ color: "var(--app-ink)" }}>{res.answer}</p>
            {res.context ? <p className="mt-1.5 inline-flex items-center gap-1 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}><MapPin className="h-3 w-3" aria-hidden />{res.context}</p> : null}

            {res.plan ? <PlanPreview plan={res.plan} /> : null}

            {res.sources.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-[14px] border px-3.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)" }}>
                {res.sources.slice(0, showAllSources ? undefined : 3).map((source, index) => <SourceRow key={`${source.category}-${source.slug}`} source={source} index={index} />)}
                {res.sources.length > 3 ? (
                  <button type="button" onClick={() => setShowAllSources((value) => !value)} className="flex min-h-10 w-full items-center justify-center border-t text-[11.5px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}>
                    {showAllSources ? "Show fewer" : `See all ${res.sources.length} matches`}
                  </button>
                ) : null}
              </div>
            ) : null}

            {res.actions && res.actions.length > 0 ? (
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Refine this answer">
                {res.actions.map((action, index) => action.href ? (
                  <Link key={`${action.label}-${action.href}`} href={action.href} target={action.href.startsWith("http") ? "_blank" : undefined} rel={action.href.startsWith("http") ? "noopener noreferrer" : undefined} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold" style={index === 0 ? { borderColor: "var(--app-brand)", color: "var(--app-on-brand)", background: "var(--app-brand)" } : { borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "transparent" }}>{action.label}{action.href.startsWith("http") ? <ExternalLink className="h-3.5 w-3.5" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden />}</Link>
                ) : (
                  <button key={`${action.label}-${action.query}`} type="button" onClick={() => runAction(action)} className="min-h-9 shrink-0 rounded-full border px-3 text-[11px] font-semibold transition active:scale-[0.98]" style={index === 0 ? { borderColor: "var(--app-brand)", color: "var(--app-on-brand)", background: "var(--app-brand)" } : { borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "transparent" }}>{action.label}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
