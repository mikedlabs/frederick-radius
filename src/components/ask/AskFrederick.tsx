"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowUp, MapPin } from "lucide-react";
import { haptic } from "@/lib/haptics";
import type { AskResult } from "@/lib/ask/answer";

/**
 * "Ask Radius" — the natural-language concierge box. Type a real
 * question, get an answer grounded in our actual data, with the real
 * places shown as clickable source cards beneath it. Fails soft: if the
 * AI key isn't set the API returns { configured:false } and we show a
 * quiet "warming up" state instead of an error.
 */

export default function AskFrederick() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);

  async function ask(query: string) {
    const text = query.trim();
    if (!text || loading) return;
    setQ(text);
    setLoading(true);
    setRes(null);
    haptic("light");
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      setRes((await r.json()) as AskResult);
    } catch {
      setRes({ configured: true, answer: "Something went wrong — try again.", sources: [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="tactile tactile-e2 rounded-[var(--app-radius-lg)] p-4"
      style={{
        background:
          "radial-gradient(120% 120% at 0% 0%, color-mix(in srgb, var(--app-brand) 10%, transparent), transparent 60%), var(--app-bg-elevated-solid)",
      }}
      aria-label="Ask Radius"
    >
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-brand)" }}>
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> Ask Radius
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="flex items-center gap-2 rounded-[var(--app-radius-md)] border px-3"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg)" }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything — “coffee open now near me”"
          className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--app-ink-3)]"
          style={{ color: "var(--app-ink)" }}
          aria-label="Ask Radius a question"
        />
        <button
          type="submit"
          disabled={!q.trim() || loading}
          aria-label="Ask"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white transition active:scale-90 disabled:opacity-40"
          style={{ background: "var(--app-brand)" }}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      </form>

      {loading && (
        <p className="mt-3 text-[13px] italic" style={{ color: "var(--app-ink-3)" }}>
          Reading the county…
        </p>
      )}

      {res && !loading && (
        <div className="mt-3">
          {res.configured === false ? (
            <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              The concierge is warming up — coming soon.
            </p>
          ) : (
            <>
              {res.answer && (
                <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
                  {res.answer}
                </p>
              )}
              {res.sources.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {res.sources.map((s) => (
                    <li key={s.slug}>
                      <Link
                        href={s.href}
                        onClick={() => haptic("light")}
                        className="tactile tactile-interactive flex items-center gap-2 rounded-[var(--app-radius-md)] px-3 py-2"
                        style={{ background: "var(--app-bg-elevated)" }}
                      >
                        <MapPin className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                          {s.name}
                        </span>
                        <span className="shrink-0 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                          {s.city || s.category}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
