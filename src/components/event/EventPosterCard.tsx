import Image from "next/image";
import Link from "next/link";
import CategoryGraphic from "@/components/ui/CategoryGraphic";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { eventReasons } from "@/lib/event-reasons";
import { eventAttendanceLabel } from "@/lib/events/attendance";
import { eventDateBlock } from "@/lib/events/format";
import { formatDistance } from "@/lib/geo";
import type { EventWithMeta } from "@/lib/loaders/events";
import { statusLabel } from "@/lib/event-status";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import {
  eventCardVisual,
  type EventCardVisual,
} from "@/components/event/eventVisuals";

export type EventPosterCardProps = {
  event: EventWithMeta;
  /**
   * A visual already approved by the surface's visual planner. When omitted,
   * the card runs the same source-aware resolver itself.
   */
  visual?: EventCardVisual;
  priorityImage?: boolean;
  whyItMatters?: string;
  /** Compact shelves do not add an outer live badge, so the poster owns it. */
  live?: boolean;
  /**
   * Shelf cards keep a taller desktop face so two-line titles, metadata, and
   * reason chips never collide with the category row.
   */
  layout?: "hero" | "shelf";
};

/**
 * Resolve the poster face without ever falling back to `event.hero_image`
 * directly. Place-photo proxy URLs do not carry the Google attribution needed
 * by an editorial poster, so even an accidentally supplied explicit visual
 * fails closed to the honest category plate.
 */
export function posterVisualForEvent(
  event: EventWithMeta,
  explicit?: EventCardVisual,
): EventCardVisual | null {
  const candidate = explicit ?? eventCardVisual(event);
  if (!candidate?.caption.trim()) return null;
  if (candidate.src.startsWith("/api/place-photo")) return null;
  return candidate;
}

/**
 * The image-led event card used for a horizon lead.
 *
 * An approved event or venue photograph gets a source caption. Everything
 * else gets the shared Radius category artwork, which is deliberately graphic
 * rather than photographic and therefore never misrepresents the event.
 */
export default function EventPosterCard({
  event,
  visual,
  priorityImage = true,
  whyItMatters,
  live = false,
  layout = "hero",
}: EventPosterCardProps) {
  const safeVisual = posterVisualForEvent(event, visual);
  const onPhoto = safeVisual !== null;
  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  const accent = cat?.color ?? "#7A7975";
  const accentText = `color-mix(in srgb, ${accent} 55%, var(--app-ink))`;
  const categoryLabel = cat?.name ?? (event.category ? event.category : "Event");
  const venueLabel = eventAttendanceLabel(event);
  const status = event.status ?? "scheduled";
  const statusText = statusLabel(status);
  const isCancelled = status === "cancelled";
  const statusBg =
    isCancelled ? "var(--app-danger)" : "var(--app-warning-press)";
  const reasons = eventReasons(event);
  const titleColor = onPhoto ? "#fff" : "var(--app-ink)";
  const subColor = onPhoto ? "rgba(255,255,255,0.92)" : "var(--app-ink-2)";
  const eyebrowColor = onPhoto
    ? `color-mix(in srgb, ${accent} 45%, #fff)`
    : accentText;
  const supportingColor = onPhoto
    ? "rgba(255,255,255,0.82)"
    : "var(--app-ink-2)";

  return (
    <article
      className={`tactile tactile-feature tactile-ring tactile-interactive group relative aspect-[3/2] w-full overflow-hidden rounded-[var(--app-radius-lg)] ${
        layout === "shelf" ? "lg:aspect-[4/3]" : "lg:aspect-[21/9]"
      }`}
      style={{
        backgroundColor: "var(--app-bg-elevated-solid)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        viewTransitionName: `event-${event.slug}`,
      }}
      data-event-poster={onPhoto ? "photo" : "category"}
    >
      {safeVisual ? (
        <>
          <Image
            src={safeVisual.src}
            alt=""
            fill
            priority={priorityImage}
            sizes="(max-width: 640px) 100vw, 720px"
            placeholder="blur"
            blurDataURL={PAPER_CREAM_BLUR}
            className="ken-burns object-cover"
          />
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.82) 2%, rgba(0,0,0,0.34) 43%, transparent 72%)",
            }}
          />
        </>
      ) : (
        <>
          <CategoryGraphic category={event.category} seed={event.slug} />
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, var(--app-bg-elevated-solid) 1%, color-mix(in srgb, var(--app-bg-elevated-solid) 86%, transparent) 42%, transparent 76%)",
            }}
          />
        </>
      )}

      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: accent, opacity: onPhoto ? 0.9 : 1 }}
      />

      <div
        className="absolute inset-x-0 top-0 flex items-center gap-2 px-4 pt-3.5"
        style={!onPhoto ? { paddingLeft: "3.75rem" } : undefined}
      >
        <span
          className="truncate text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{
            color: eyebrowColor,
            textShadow: onPhoto ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
          }}
        >
          {categoryLabel}
        </span>
        {live && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white"
            style={{ background: "var(--app-positive)" }}
          >
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
            Live
          </span>
        )}
        {statusText && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white"
            style={{ background: statusBg }}
          >
            {statusText}
          </span>
        )}
        {safeVisual ? (
          <span className="ml-auto max-w-[62%] truncate rounded-full bg-black/45 px-2 py-1 text-[9px] font-semibold tracking-[0.02em] text-white backdrop-blur-sm">
            {safeVisual.caption}
          </span>
        ) : (
          event.distance_m !== undefined && (
            <span
              className="ml-auto shrink-0 font-mono text-[11px] tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {formatDistance(event.distance_m)}
            </span>
          )
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <Link
          href={`/events/${event.slug}`}
          prefetch={false}
          className={`flex min-h-11 items-end font-serif text-[21px] leading-[1.08] tracking-tight outline-none focus-visible:underline ${
            isCancelled ? "line-through opacity-70" : ""
          }`}
          style={{ color: titleColor }}
        >
          <span className="absolute inset-0" aria-hidden />
          <span className="line-clamp-2">{event.title}</span>
        </Link>
        <p className="mt-1 truncate text-[13px]" style={{ color: subColor }}>
          {date.weekday && (
            <span className="font-mono tabular-nums">
              {date.weekday} {date.month} {date.day}
            </span>
          )}
          {date.time && (
            <span className="font-mono tabular-nums">{" · "}{date.time}</span>
          )}
          {venueLabel ? ` · ${venueLabel}` : ""}
          {safeVisual && event.distance_m !== undefined
            ? ` · ${formatDistance(event.distance_m)}`
            : ""}
        </p>
        {whyItMatters && (
          <p
            className="mt-1 line-clamp-1 text-[12.5px] leading-snug"
            style={{ color: supportingColor }}
          >
            {whyItMatters}
          </p>
        )}
        {(reasons.length > 0 || event.is_free) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {event.is_free && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{
                  background: onPhoto
                    ? "rgba(255,255,255,0.92)"
                    : "color-mix(in srgb, var(--app-positive) 14%, transparent)",
                  color: "var(--app-positive)",
                }}
              >
                Free
              </span>
            )}
            {!onPhoto && reasons.length > 0 && (
              <ReasonChipRow reasons={reasons} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
