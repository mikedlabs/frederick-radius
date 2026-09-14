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
import Image from "next/image";
import { Sparkles, X, ArrowRight, ExternalLink, MapPin } from "lucide-react";
import {
  type DecisionAction,
  type DecisionStage,
  type DecisionTelemetry,
  trackDecision,
} from "@/lib/decision/telemetry";
import { track } from "@/lib/track";

export type SpotlightMoment = {
  slug: string;
  title: string;
  spotlightLead: string;
  accent: string;
  spotlightFacts?: Array<{ label: string; value: string }>;
  spotlightImage?: {
    src: string;
    alt: string;
    credit: string;
    width: number;
    height: number;
  };
  spotlightSourceUrl?: string;
  /** A scoped directions link for an event with a well-defined public location. */
  spotlightDirectionsUrl?: string;
};

export function momentSpotlightDecision(
  slug: string,
  stage: DecisionStage,
  action?: DecisionAction,
): DecisionTelemetry {
  return {
    stage,
    surface: "today",
    entityKind: "event",
    entityId: slug,
    position: "lead",
    ...(action ? { action } : {}),
  };
}

export default function MomentSpotlight({ moment, isDayOf }: { moment: SpotlightMoment; isDayOf?: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const key = `fr.moment-dismissed:${moment.slug}${isDayOf ? ":day-of" : ""}`;

  useEffect(() => {
    trackDecision(momentSpotlightDecision(moment.slug, "impression"));
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

  if (isDayOf && moment.spotlightImage) {
    return <DayOfMomentSpotlight moment={moment} />;
  }

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
      {isDayOf && moment.spotlightImage && (
        <figure className="relative -mx-5 -mt-5 mb-5 aspect-[16/9] overflow-hidden sm:-mx-6 sm:-mt-6 sm:mb-6 sm:aspect-[21/8]">
          <Image
            src={moment.spotlightImage.src}
            alt={moment.spotlightImage.alt}
            fill
            priority
            sizes="(min-width: 1024px) 68rem, 100vw"
            className="object-cover object-center"
          />
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2"
            style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--app-ink) 76%, transparent), transparent)" }}
          />
          <figcaption className="absolute inset-x-0 bottom-0 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--app-on-brand)] sm:px-6">
            {moment.spotlightImage.credit}
          </figcaption>
        </figure>
      )}
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
          <Link href={`/moments/${moment.slug}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-sm)] px-3.5 text-[13px] font-semibold" style={{ background: "var(--app-brand)", color: "var(--app-bg)" }} onClick={() => {
            trackDecision(momentSpotlightDecision(moment.slug, "open", "open"));
            track("moment_spotlight_open", { slug: moment.slug, day_of: isDayOf ? "true" : "false" });
          }}>
            Plan your day
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </Link>
          {moment.spotlightSourceUrl && (
            <a href={moment.spotlightSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }} onClick={() => trackDecision(momentSpotlightDecision(moment.slug, "action", "website"))}>
              Official event details
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The day-of treatment is intentionally a visual event lead, not a compact
 * directory. It keeps the next decision (time, place, and where to go) in
 * reach without hiding the photograph's full 16:9 composition behind a
 * desktop banner crop.
 */
function DayOfMomentSpotlight({ moment }: { moment: SpotlightMoment }) {
  const image = moment.spotlightImage;
  const facts = moment.spotlightFacts ?? [];
  const when = facts.find((fact) => fact.label === "When")?.value ?? "Today";
  const where = facts.find((fact) => fact.label === "Where")?.value;

  if (!image) return null;

  return (
    <section
      aria-label={`${moment.title} featured event`}
      data-moment-spotlight-day-of="true"
      className="overflow-hidden rounded-[var(--app-radius-xl)] border shadow-[var(--app-shadow-1)]"
      style={{
        borderColor: `color-mix(in srgb, ${moment.accent} 45%, var(--app-border))`,
        background: "var(--app-bg-elevated-solid)",
      }}
    >
      <figure className="relative aspect-[16/9] overflow-hidden" style={{ background: "var(--app-brand-press)" }}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          priority
          sizes="(min-width: 1024px) 68rem, 100vw"
          className="object-cover object-center"
        />
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--app-ink) 86%, transparent) 0%, color-mix(in srgb, var(--app-ink) 40%, transparent) 45%, transparent 74%)" }}
        />
        <div className="absolute inset-x-0 bottom-0 p-5 pr-28 sm:p-7 sm:pr-36">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-on-brand)]">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            {when}
          </p>
          <h2 className="mt-1 max-w-[12ch] font-editorial text-[42px] font-normal leading-[0.92] tracking-[-0.035em] text-[var(--app-on-brand)] sm:text-[58px]">
            {moment.title}
          </h2>
          {where && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--app-on-brand)] sm:text-[15px]">
              <MapPin className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              {where}
            </p>
          )}
        </div>
        <figcaption
          className="absolute right-3 top-3 max-w-[8.5rem] rounded-[var(--app-radius-xs)] px-2 py-1 text-right text-[8px] font-semibold uppercase leading-tight tracking-[0.1em] text-[var(--app-on-brand)] sm:right-5 sm:top-5 sm:max-w-none sm:text-[9px]"
          style={{ background: "color-mix(in srgb, var(--app-ink) 58%, transparent)" }}
        >
          {image.credit}
        </figcaption>
      </figure>

      <div className="p-4 sm:px-6 sm:py-5">
        {facts.length > 0 && (
          <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
            {facts.map((fact, index) => (
              <div key={fact.label} className="inline-flex items-center gap-x-3">
                {index > 0 && <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>}
                <dt className="sr-only">{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
          <Link
            href={`/moments/${moment.slug}`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[var(--app-radius-sm)] px-4 text-[13px] font-semibold sm:w-auto"
            style={{ background: "var(--app-brand)", color: "var(--app-bg)" }}
            onClick={() => {
              trackDecision(momentSpotlightDecision(moment.slug, "open", "open"));
              track("moment_spotlight_open", { slug: moment.slug, day_of: "true" });
            }}
          >
            Open the day plan
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </Link>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {moment.spotlightDirectionsUrl && (
              <a href={moment.spotlightDirectionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }} onClick={() => trackDecision(momentSpotlightDecision(moment.slug, "action", "directions"))}>
                Get directions
                <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </a>
            )}
            {moment.spotlightSourceUrl && (
              <a href={moment.spotlightSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }} onClick={() => trackDecision(momentSpotlightDecision(moment.slug, "action", "website"))}>
                Official schedule
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
