"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Search,
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

function SourceCard({ source, lead = false }: { source: AskSource; lead?: boolean }) {
  const external = source.href.startsWith("http");
  return (
    <Link
      href={source.href}
      onClick={() => haptic("light")}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`group relative flex overflow-hidden rounded-[16px] border transition active:scale-[0.995] ${lead ? "min-h-[132px]" : "min-h-[96px]"}`}
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
        boxShadow: lead ? "var(--app-elev-1), var(--app-hi)" : "var(--app-hi)",
      }}
    >
      {source.photo_url ? (
        <div className={`${lead ? "w-[34%] min-w-[108px]" : "w-[27%] min-w-[82px]"} relative shrink-0 overflow-hidden`}>
          <Image
            src={source.photo_url}
            alt=""
            fill
            unoptimized
            sizes={lead ? "180px" : "110px"}
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/[0.04]" aria-hidden />
        </div>
      ) : null}
      <div className={`flex min-w-0 flex-1 flex-col ${lead ? "p-3.5" : "p-3"}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-brand-press)" }}>
              {source.eyebrow || source.category}
            </p>
            <h3 className={`${lead ? "mt-1 text-[17px]" : "mt-0.5 text-[15px]"} font-semibold leading-tight tracking-[-0.01em]`} style={{ color: "var(--app-ink)" }}>
              {source.name}
            </h3>
          </div>
          {external ? <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 opacity-35" aria-hidden /> : <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 opacity-35 transition-transform group-hover:translate-x-0.5" aria-hidden />}
        </div>
        {source.reason ? <p className="mt-1.5 text-[12.5px] font-medium leading-snug" style={{ color: "var(--app-ink-2)" }}>{source.reason}</p> : null}
        {lead && source.detail ? <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>{source.detail}</p> : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[10.5px] font-medium" style={{ color: "var(--app-ink-3)" }}>
          {source.distance ? <span className="inline-flex items-center gap-1"><Navigation className="h-3 w-3" aria-hidden />{source.distance}</span> : null}
          {source.status ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden />{source.status}</span> : null}
          {source.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden />{source.phone}</span> : null}
          {source.confidence === "high" ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden />Verified</span> : null}
        </div>
      </div>
    </Link>
  );
}

function PlanPreview({ plan }: { plan: AskPlanPreview }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[18px] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}>
      <div className="border-b px-4 py-3.5" style={{ borderColor: "var(--app-border)", background: "color-mix(in srgb, var(--app-brand) 7%, var(--app-bg-elevated-solid))" }}>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Ready-to-run route
        </div>
        <h3 className="mt-1.5 font-serif text-[22px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{plan.title}</h3>
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>{plan.summary}</p>
      </div>
      <ol data-testid="ask-plan-stops" className="px-4 py-2">
        {plan.stops.map((stop, index) => (
          <li key={`${stop.order}-${stop.href}`} className="relative grid grid-cols-[34px_1fr] gap-2.5 py-3">
            {index < plan.stops.length - 1 ? <span className="absolute bottom-[-2px] left-[16px] top-[37px] w-px" style={{ background: "var(--app-border)" }} aria-hidden /> : null}
            <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full border text-[11px] font-bold" style={{ borderColor: "var(--app-brand)", background: "var(--app-bg-elevated-solid)", color: "var(--app-brand-press)" }}>{stop.order}</span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={stop.href} className="min-w-0 truncate text-[14px] font-semibold hover:underline" style={{ color: "var(--app-ink)" }}>{stop.name}</Link>
                <span className="shrink-0 font-mono text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>{stop.time}</span>
              </div>
              <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>{stop.category} · {stop.status}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{stop.why}</p>
              {stop.tip ? <p className="mt-1.5 line-clamp-3 rounded-lg px-2 py-1.5 text-[10.5px] leading-relaxed" style={{ color: "var(--app-ink-2)", background: "var(--app-bg)" }}><span className="font-bold">Field note:</span> {stop.tip}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <Link href={plan.href} className="group flex min-h-12 items-center justify-between border-t px-4 text-[12.5px] font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}>
        Open, swap stops, and share
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

type AskFrederickProps = {
  hideLabel?: boolean;
  quickAsks?: TodayPrompt[];
};

function activeContextLabel(scope: Scope | null): string {
  if (scope === "nearme" && readCachedPosition()) return "Near your location";
  if (scope) return scopeLabel(scope);
  return readCachedPosition() ? "Near your location" : "Whole county";
}

export default function AskFrederick({ hideLabel = false, quickAsks = QUICK_ASKS }: AskFrederickProps = {}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);
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
        className="flex items-center gap-2 rounded-[16px] border bg-[var(--app-bg-elevated-solid)] px-3"
        style={{ borderColor: "var(--app-border-strong, var(--app-border))", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
      >
        <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={res ? "Follow up: closer, cheaper, tomorrow…" : "Ask for a place, a plan, or what’s happening"}
          className="h-13 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[var(--app-ink-3)]"
          style={{ color: "var(--app-ink)" }}
          aria-label="Ask Frederick Radius"
        />
        <button type="submit" disabled={!q.trim() || loading} aria-label="Ask Radius" className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-35" style={{ background: "var(--app-brand)", color: "var(--app-on-brand, #fff)" }}>
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      </form>

      <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Ideas to ask Radius">
        {quickAsks.map((prompt) => (
          <button key={prompt.label} type="button" onClick={() => void ask(prompt.query)} disabled={loading} className="min-h-9 shrink-0 rounded-full border px-3 text-[11.5px] font-semibold transition active:scale-[0.98] disabled:opacity-45" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}>
            {prompt.label}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {loading ? (
          <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border px-3 py-3 text-[12.5px]" style={{ color: "var(--app-ink-2)", borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
            <span className="pulse-dot h-2 w-2 rounded-full" style={{ background: "var(--app-brand)" }} aria-hidden />
            Checking fit, distance, and hours…
          </div>
        ) : null}

        {res && !loading ? (
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink)" }}>{res.answer}</p>
            {res.context ? <p className="mt-1.5 inline-flex items-center gap-1 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}><MapPin className="h-3 w-3" aria-hidden />{res.context}</p> : null}

            {res.plan ? <PlanPreview plan={res.plan} /> : null}

            {res.sources.length > 0 ? (
              <div className="mt-4 space-y-2.5">
                {res.sources.map((source, index) => <SourceCard key={`${source.category}-${source.slug}`} source={source} lead={index === 0} />)}
              </div>
            ) : null}

            {res.actions && res.actions.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Refine this answer">
                {res.actions.map((action, index) => action.href ? (
                  <Link key={`${action.label}-${action.href}`} href={action.href} target={action.href.startsWith("http") ? "_blank" : undefined} rel={action.href.startsWith("http") ? "noopener noreferrer" : undefined} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold" style={index === 0 ? { borderColor: "var(--app-brand)", color: "var(--app-on-brand)", background: "var(--app-brand)" } : { borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "var(--app-bg-elevated)" }}>{action.label}{action.href.startsWith("http") ? <ExternalLink className="h-3.5 w-3.5" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden />}</Link>
                ) : (
                  <button key={`${action.label}-${action.query}`} type="button" onClick={() => runAction(action)} className="min-h-9 rounded-full border px-3 text-[11.5px] font-semibold transition active:scale-[0.98]" style={index === 0 ? { borderColor: "var(--app-brand)", color: "var(--app-on-brand)", background: "var(--app-brand)" } : { borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "var(--app-bg-elevated)" }}>{action.label}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
