"use client";

/**
 * MomentSpotlight — the festive "big weekend" module on /today.
 *
 * When a curated civic moment is live (the Fourth, the Fair, the holiday
 * markets), this rides near the top of Today as a celebratory spotlight (NOT
 * the alarm-toned CivicAlerts): the moment's name, its single most useful line,
 * and a way into the full hub. Pre-event teasers are dismissible for the
 * session; on the day itself, the full plan stays available at the top. It
 * self-hides entirely when no moment is live. The active-moment decision is
 * made server-side and passed in; this component only owns the festive shell.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowRight, ExternalLink } from "lucide-react";
import { track } from "@/lib/track";

export type SpotlightMoment = {
  slug: string;
  title: string;
  spotlightLead: string;
  accent: string;
  spotlightFacts?: Array<{ label: string; value: string }>;
  spotlightSourceUrl?: string;
};

export default function MomentSpotlight({ moment, isDayOf }: { moment: SpotlightMoment; isDayOf?: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const key = `fr.moment-dismissed:${moment.slug}${isDayOf ? ":day-of" : ""}`;

  useEffect(() => {
    if (isDayOf) {
      track("moment_spotlight_view", { slug: moment.slug, day_of: "true" });
      return;
    }
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount sessionStorage read; SSR can't see it
      if (sessionStorage.getItem(key) === "1") setDismissed(true);
      else track("moment_spotlight_view", { slug: moment.slug });
    } catch {
      /* ignore */
    }
  }, [isDayOf, key, moment.slug]);

  if (dismissed && !isDayOf) return null;

  return (
    <section
      aria-label={moment.title}
      className="relative overflow-hidden rounded-[var(--app-radius-xl)] border p-5 shadow-[var(--app-shadow-1)] sm:p-6"
      style={{
        borderColor: `color-mix(in srgb, ${moment.accent} 45%, var(--app-border))`,
        background: `linear-gradient(135deg, color-mix(in srgb, ${moment.accent} 12%, var(--app-bg-elevated-solid)), color-mix(in srgb, var(--app-accent) 10%, var(--app-bg-elevated-solid)))`,
      }}
    >
      {/* One restrained editorial bloom for a shared occasion. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${moment.accent} 24%, transparent), transparent 70%)` }}
      />
      {!isDayOf && (
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
            track("moment_spotlight_dismiss", { slug: moment.slug });
          }}
          aria-label="Dismiss"
          className="tap-44 absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full"
          style={{ color: "var(--app-ink-3)" }}
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </button>
      )}

      <div className="relative">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: moment.accent }}>
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          {isDayOf ? "Today in Frederick County" : "This weekend"}
        </p>
        <h2 className="mt-1 text-[28px] font-semibold leading-[1.04] tracking-tight sm:text-[32px]" style={{ color: "var(--app-ink)" }}>
          {moment.title}
        </h2>
        <p className="mt-1 max-w-[46ch] text-[15px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {moment.spotlightLead}
        </p>

        {moment.spotlightFacts && moment.spotlightFacts.length > 0 && (
          <dl className="mt-4 grid max-w-2xl gap-px overflow-hidden rounded-[var(--app-radius-md)] border sm:grid-cols-3" style={{ borderColor: "color-mix(in srgb, var(--app-ink) 14%, var(--app-border))", background: "color-mix(in srgb, var(--app-ink) 8%, transparent)" }}>
            {moment.spotlightFacts.map((fact) => (
              <div key={fact.label} className="px-3.5 py-3" style={{ background: "color-mix(in srgb, var(--app-bg-elevated-solid) 88%, transparent)" }}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>{fact.label}</dt>
                <dd className="mt-0.5 text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={`/moments/${moment.slug}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-sm)] px-3.5 text-[13px] font-semibold" style={{ background: "var(--app-brand)", color: "var(--app-bg)" }} onClick={() => track("moment_spotlight_open", { slug: moment.slug, day_of: isDayOf ? "true" : "false" })}>
            Plan your day
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </Link>
          {moment.spotlightSourceUrl && (
            <a href={moment.spotlightSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
              Official event details
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
