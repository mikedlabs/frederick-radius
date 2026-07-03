"use client";

/**
 * MomentSpotlight — the festive "big weekend" module on /today.
 *
 * When a curated civic moment is live (the Fourth, the Fair, the holiday
 * markets), this rides near the top of Today as a celebratory spotlight (NOT
 * the alarm-toned CivicAlerts): the moment's name, its single most useful line,
 * and a way into the full hub. Dismissible for the session (sessionStorage,
 * keyed by slug) so it never nags, and self-hides entirely when no moment is
 * live. The active-moment decision is made server-side and passed in; this
 * component only owns the festive shell + the dismiss.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { track } from "@/lib/track";

export type SpotlightMoment = {
  slug: string;
  title: string;
  spotlightLead: string;
  accent: string;
};

export default function MomentSpotlight({ moment }: { moment: SpotlightMoment }) {
  const [dismissed, setDismissed] = useState(false);
  const key = `fr.moment-dismissed:${moment.slug}`;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount sessionStorage read; SSR can't see it
      if (sessionStorage.getItem(key) === "1") setDismissed(true);
      else track("moment_spotlight_view", { slug: moment.slug });
    } catch {
      /* ignore */
    }
  }, [key, moment.slug]);

  if (dismissed) return null;

  return (
    <section
      aria-label={moment.title}
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border p-3.5 shadow-[var(--app-shadow-1)]"
      style={{
        borderColor: `color-mix(in srgb, ${moment.accent} 45%, var(--app-border))`,
        background: `linear-gradient(135deg, color-mix(in srgb, ${moment.accent} 12%, var(--app-bg-elevated-solid)), color-mix(in srgb, var(--app-accent) 10%, var(--app-bg-elevated-solid)))`,
      }}
    >
      {/* faint radiating burst, the "fireworks" gesture */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${moment.accent} 22%, transparent), transparent 70%)` }}
      />
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

      <Link href={`/moments/${moment.slug}`} className="relative block pr-8" onClick={() => track("moment_spotlight_open", { slug: moment.slug })}>
        <p className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: moment.accent }}>
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          This weekend
        </p>
        <h2 className="mt-1 font-serif text-[19px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          {moment.title}
        </h2>
        <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {moment.spotlightLead}
        </p>
        <span className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
          See the full guide
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </span>
      </Link>
    </section>
  );
}
