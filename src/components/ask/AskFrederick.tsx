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

export default function AskFrederick({ hideLabel = false }: { hideLabel?: boolean } = {}) {
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
      if (r.status === 429) {
        // Rate limited (abuse guard on the paid LLM route). Show the
        // server's friendly note, not a crash — the body is {error,message},
        // not an AskResult, so never cast it straight into state.
        const j = (await r.json().catch(() => ({}))) as { message?: string };
        setRes({
          configured: true,
          answer: j.message ?? "Too many questions — give it a moment.",
          sources: [],
        });
      } else if (!r.ok) {
        setRes({ configured: true, answer: "Something went wrong — try again.", sources: [] });
      } else {
        setRes((await r.json()) as AskResult);
      }
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
      {/* Eyebrow is the box's label on /guide; on /today the page's
          "Ask Radius anything." headline already labels it, so it's hidden
          to avoid saying "Ask Radius" twice in a row. */}
      {!hideLabel && (
        <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-brand)" }}>
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> Ask Radius
        </div>
      )}

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
          placeholder="Ask anything, like “coffee open now near me”"
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
          {/* Even without the AI key the API keyword-matches real places, so
              we show those as the result instead of a dead "coming soon".
              Only when there's genuinely nothing do we fall back to a hint. */}
          {res.configured === false && res.sources.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              The concierge is warming up. Meanwhile, try a category above — or ask for a place, a cuisine, or “open now”.
            </p>
          ) : (
            <>
              {res.configured === false ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                  Top matches
                </p>
              ) : (
                res.answer && (
                  <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
                    {res.answer}
                  </p>
                )
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
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
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
