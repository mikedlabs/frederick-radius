"use client";

/**
 * MomentSpotlight — the festive "big weekend" module on /today.
 *
 * When a curated civic moment is live (the Fourth, the Fair, the holiday
 * markets), this rides on Today as a quiet spotlight (NOT the alarm-toned
 * CivicAlerts): a real picture, the moment's name, its single most useful
 * line, and a way into the full hub. The picture is the moment's own photo
 * or its licensed town photo at 96px, credited after it loads, and otherwise
 * the first day's date plate. Pre-event teasers are dismissible for the
 * session; on the day itself, the full plan stays available at the top. It
 * self-hides entirely when no moment is live. The active-moment decision is
 * made server-side and passed in; this component only owns the shell.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Sparkles, X, ArrowRight, ExternalLink, MapPin } from "lucide-react";
import DatePlate from "@/components/event/DatePlate";
import {
  momentDays,
  momentHeroImage,
  momentPhotoCreditText,
  sourcedMomentFacts,
} from "@/components/moment/momentGuide";
import RadiusPhoto, {
  RadiusPhotoScope,
  RadiusPhotoWhen,
} from "@/components/ui/RadiusPhoto";
import type { MomentDay, MomentHeroPhoto } from "@/data/civic-moments";
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
  spotlightFacts?: Array<{ label: string; value: string; source_url?: string }>;
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
  /** A licensed town photograph for the compact thumbnail. */
  heroPhoto?: MomentHeroPhoto;
  /** The days the occasion runs; the first one becomes the fallback plate. */
  days?: MomentDay[];
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

  const facts = sourcedMomentFacts(moment.spotlightFacts);
  const image = momentHeroImage(moment, 320);
  const firstDay = momentDays(moment.days)[0];
  const plate = firstDay ? (
    <DatePlate
      month={firstDay.month}
      day={firstDay.day}
      weekday={firstDay.weekday}
      accent="var(--app-brand)"
      size="md"
    />
  ) : null;
  const credit =
    image.kind === "licensed"
      ? momentPhotoCreditText(image.credit)
      : image.kind === "owned"
        ? image.credit
        : null;

  const card = (
    <section
      aria-label={moment.title}
      data-moment-spotlight={moment.slug}
      className="relative rounded-[var(--app-radius-lg)] border p-3 sm:p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)" }}
    >
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
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}

      <div className="flex gap-3 sm:gap-4">
        {image.kind === "none" ? (
          plate
        ) : (
          <>
            <RadiusPhotoWhen is="visible">
              <RadiusPhoto
                size={96}
                alt={image.alt}
                className="rounded-[var(--app-radius-md)]"
              />
            </RadiusPhotoWhen>
            <RadiusPhotoWhen is="missing">{plate}</RadiusPhotoWhen>
          </>
        )}
        <div className={`min-w-0 flex-1 ${isDayOf ? "" : "pr-7"}`}>
          <p className="text-meta-lg font-semibold" style={{ color: "var(--app-ink-3)" }}>
            {isDayOf ? "Today" : "This weekend"}
          </p>
          <h2 className="text-title mt-0.5" style={{ color: "var(--app-ink)" }}>
            {moment.title}
          </h2>
          {facts.length > 0 && (
            // One fact per line: in this narrow card a dot separator wrapped
            // to the start of the next line ("· Free").
            <dl className="mt-1 space-y-0.5 text-meta-lg font-semibold" style={{ color: "var(--app-ink)" }}>
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="sr-only">{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <p className="mt-2 text-body" style={{ color: "var(--app-ink-2)" }}>
        {moment.spotlightLead}
      </p>

      <div className="flex flex-wrap items-center gap-x-4">
        <Link
          href={`/moments/${moment.slug}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-body font-semibold"
          style={{ color: "var(--app-brand-press)" }}
          onClick={() => {
            trackDecision(momentSpotlightDecision(moment.slug, "open", "open"));
            track("moment_spotlight_open", { slug: moment.slug, day_of: isDayOf ? "true" : "false" });
          }}
        >
          Plan your day
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {moment.spotlightSourceUrl && (
          <a
            href={moment.spotlightSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-meta-lg font-semibold"
            style={{ color: "var(--app-brand-press)" }}
            onClick={() => trackDecision(momentSpotlightDecision(moment.slug, "action", "website"))}
          >
            Official event details
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>

      {image.kind !== "none" && credit && (
        <RadiusPhotoWhen is="ready">
          <p className="text-caption" style={{ color: "var(--app-ink-3)" }} data-moment-spotlight-credit>
            {credit}
          </p>
        </RadiusPhotoWhen>
      )}
    </section>
  );

  // The picture, its credit and the date-plate fallback live in different
  // parts of the card, so one scope shares the photo's load state with all
  // three. Without a picture there is nothing to scope.
  return image.kind === "none" ? (
    card
  ) : (
    <RadiusPhotoScope src={image.src} size={96}>
      {card}
    </RadiusPhotoScope>
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
        {/* An Ink scrim under the type only: the bottom 60% of the frame. */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5"
          style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--app-ink) 86%, transparent) 0%, color-mix(in srgb, var(--app-ink) 40%, transparent) 55%, transparent)" }}
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
          className="absolute right-3 top-3 max-w-[8.5rem] rounded-[var(--app-radius-xs)] px-2 py-1 text-right text-caption font-semibold text-[var(--app-on-brand)] sm:right-5 sm:top-5 sm:max-w-none"
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
                <dt className="sr-only">{fact.label}</dt>
                <dd>{fact.value}</dd>
                {/* The dot trails its fact, so a wrap never starts a line with it. */}
                {index < facts.length - 1 && <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>}
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
