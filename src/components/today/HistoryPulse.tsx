import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { HISTORY } from "@/data/history";

/**
 * HistoryPulse — a small "did you know" card on Today that rotates
 * daily through Frederick County facts. Adds context and pride to a
 * data-heavy page; teaches visitors something they didn't know.
 *
 * Pure server, deterministic per day. Click-through to /history opens
 * the editorial section.
 */
export default function HistoryPulse() {
  const facts = HISTORY.filter((h) => h.kind === "fact" || h.kind === "moment");
  if (facts.length === 0) return null;
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const fact = facts[((dayIdx % facts.length) + facts.length) % facts.length];

  return (
    <Link
      href="/history"
      aria-label={`History: ${fact.title}`}
      className="tactile tactile-feature tactile-interactive group relative block overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-5"
      style={{ "--section-accent": "#2A5D8F" } as React.CSSProperties}
    >
      {/* Soft civic-blue corner bloom — distinct from the warm brand
          orange used by news / events so the page reads with rhythm. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(85% 100% at 100% 0%, color-mix(in srgb, #2A5D8F 16%, transparent), transparent 60%)",
        }}
      />
      {/* Decorative serif "&" in the background corner — editorial
          ornament that reads as "history" without illustration. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-6 -right-3 font-serif text-[140px] font-bold leading-none"
        style={{ color: "#2A5D8F", opacity: 0.07 }}
      >
        &amp;
      </span>
      <div className="relative">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              background: "color-mix(in srgb, #2A5D8F 18%, transparent)",
              color: "#2A5D8F",
            }}
          >
            <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Did you know
          </span>
          {(fact.date_label || fact.year) && (
            <span
              className="text-[10px] font-semibold tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {fact.date_label ?? fact.year}
            </span>
          )}
        </div>
        <h3
          className="mt-2 font-serif text-[20px] font-semibold leading-snug tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {fact.title}
        </h3>
        <p
          className="mt-1.5 line-clamp-3 text-[13.5px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          {fact.body}
        </p>
        <p
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "#2A5D8F" }}
        >
          More Frederick history
          <ArrowRight
            className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.5}
            aria-hidden
          />
        </p>
      </div>
    </Link>
  );
}
