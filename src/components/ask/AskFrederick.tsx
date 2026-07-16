"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, ExternalLink, MapPin, Search } from "lucide-react";
import { track } from "@/lib/track";
import { haptic } from "@/lib/haptics";
import type { AskResult } from "@/lib/ask/answer";
import { readCachedPosition } from "@/hooks/useGeolocation";
import { getScope, subscribeScopeChange } from "@/lib/scope";

const ASK_CACHE_LIMIT = 24;
const ASK_CACHE_TTL_MS = 45_000;
const QUICK_ASKS = [
  "Open now",
  "Coffee downtown",
  "Something tonight",
  "Report an issue",
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

export default function AskFrederick({ hideLabel = false }: { hideLabel?: boolean } = {}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeScopeChange(() => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setRes(null);
    });
    return () => {
      unsubscribe();
      abortRef.current?.abort();
    };
  }, []);

  async function ask(query: string) {
    const text = query.trim();
    if (!text) return;
    abortRef.current?.abort();
    const requestId = ++requestIdRef.current;
    const position = readCachedPosition();
    const scope = getScope();
    const cacheKey = `${text.toLowerCase()}|${scope ?? "no-scope"}|${position ? `${position.lat.toFixed(3)},${position.lng.toFixed(3)}` : "no-fix"}`;
    setQ(text);
    setRes(null);
    haptic("light");
    track("ask_submit");

    const cached = askCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= ASK_CACHE_TTL_MS) {
      setRes(cached.result);
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
          query: text,
          scope: scope ?? undefined,
          lat: position ? Number(position.lat.toFixed(4)) : undefined,
          lng: position ? Number(position.lng.toFixed(4)) : undefined,
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
      if (requestId === requestIdRef.current) setRes(next);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === requestIdRef.current) {
        setRes(errorResult("Radius couldn’t reach the answer service. Check your connection and try again."));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  }

  return (
    <div>
      {!hideLabel ? (
        <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
          <Search className="h-4 w-4" aria-hidden /> Search Radius
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(q);
        }}
        className="flex items-center gap-2 rounded-[14px] border bg-[var(--app-bg-elevated-solid)] px-3"
        style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
      >
        <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Try “coffee open now downtown”"
          className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[var(--app-ink-3)]"
          style={{ color: "var(--app-ink)" }}
          aria-label="Search Frederick Radius"
        />
        <button
          type="submit"
          disabled={!q.trim() || loading}
          aria-label="Search"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-35"
          style={{ background: "var(--app-brand)", color: "var(--app-on-brand, #fff)" }}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      </form>

      <div className="mt-2.5 flex flex-wrap gap-2" aria-label="Quick searches">
        {QUICK_ASKS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void ask(prompt)}
            disabled={loading}
            className="min-h-9 rounded-full border px-3 text-[11.5px] font-semibold transition active:scale-[0.98] disabled:opacity-45"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
            <span className="pulse-dot h-2 w-2 rounded-full" style={{ background: "var(--app-brand)" }} aria-hidden />
            Checking Radius…
          </div>
        ) : null}

        {res && !loading ? (
          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink)" }}>{res.answer}</p>
            {res.context ? <p className="mt-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>Ranked for {res.context}</p> : null}

            {res.sources.length > 0 ? (
              <ul className="mt-3 divide-y" style={{ borderColor: "var(--app-border)" }}>
                {res.sources.map((source) => {
                  const external = source.href.startsWith("http");
                  return (
                    <li key={`${source.category}-${source.slug}`}>
                      <Link
                        href={source.href}
                        onClick={() => haptic("light")}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                        className="group flex min-h-12 items-center gap-3 py-2.5"
                      >
                        <MapPin className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>{source.name}</span>
                        <span className="shrink-0 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>{source.city || source.category}</span>
                        {external ? <ExternalLink className="h-3.5 w-3.5 opacity-40" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5 opacity-40 transition-transform group-hover:translate-x-0.5" aria-hidden />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
