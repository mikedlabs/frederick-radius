import Link from "next/link";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDateBlock } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import SaveButton from "@/components/saved/SaveButton";
import EventActions from "@/components/event/EventActions";
import TrustChip from "@/components/ui/TrustChip";
import { Chip } from "@/components/ui/Chip";
import { eventTrust } from "@/lib/trust";
import { formatDistance } from "@/lib/geo";
import { venueLabel } from "@/lib/format/eventTime";

export default function EventCard({
  event,
  variant = "row",
}: {
  event: EventWithMeta;
  variant?: "row" | "tile";
}) {
  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  const venue = venueLabel(event.venue_name);

  // Date-anchored compact card. ONE date instance (the left anchor) —
  // no duplicated day number, no ~96px near-empty media box for the
  // photo-less majority. A real photo backs the date anchor (still
  // photographic, never fabricated); otherwise a category-tinted
  // block. Uniform shape -> a clean, scannable grid; far less wasted
  // space so more events fit per screen.
  if (variant === "tile") {
    const accent = cat?.color ?? "var(--app-brand, #C4451C)";
    const hasPhoto = Boolean(event.hero_image);
    return (
      <article className="tactile tactile-interactive group relative flex gap-3 overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)] p-2.5">
        <div
          aria-hidden
          className="relative grid h-[64px] w-[56px] shrink-0 place-items-center overflow-hidden rounded-[var(--app-radius-sm)]"
          style={hasPhoto ? undefined : { background: `linear-gradient(155deg, ${accent}2e, ${accent}0d)` }}
        >
          {hasPhoto && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- proxied/remote venue photo; plain img avoids a domain allowlist for the key-safe proxy */}
              <img
                src={event.hero_image}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/45" />
            </>
          )}
          <div className="relative text-center leading-none" style={{ color: hasPhoto ? "white" : accent }}>
            <div className="text-[9px] font-bold uppercase tracking-wide">{date.month}</div>
            <div className="font-serif text-[22px] font-semibold">{date.day}</div>
            <div className="text-[9px] font-medium opacity-80">{date.weekday}</div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={`/events/${event.slug}`}
            className="line-clamp-2 font-serif text-[14.5px] font-semibold leading-snug tracking-tight outline-none focus-visible:underline"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {date.time}
            {venue ? ` · ${venue}` : ""}
          </p>
          <div className="mt-auto flex items-center gap-1.5 pt-1.5">
            {cat && (
              <Chip color={cat.color} className="uppercase tracking-wide">
                {cat.name}
              </Chip>
            )}
            {event.is_free && (
              <span className="text-[10px] font-semibold" style={{ color: "var(--app-positive)" }}>
                Free
              </span>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="tactile tactile-interactive group relative flex items-stretch gap-3 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-3">
      <div
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--app-radius-md)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
        {event.hero_image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- proxied/remote venue photo; plain img avoids a domain allowlist for the key-safe proxy */}
            <img
              src={event.hero_image}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-center gap-1 px-1 pb-1 text-white">
              <span className="text-[9px] font-bold uppercase tracking-wide">{date.month}</span>
              <span className="font-serif text-[15px] font-semibold leading-none">{date.day}</span>
            </div>
          </>
        ) : (
          <div aria-hidden className="flex h-full w-full flex-col items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cat?.color ?? "var(--app-brand)" }}>
              {date.month}
            </span>
            <span className="font-serif text-xl font-semibold leading-none" style={{ color: "var(--app-ink)" }}>
              {date.day}
            </span>
            <span className="mt-0.5 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
              {date.weekday}
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            href={`/events/${event.slug}`}
            className="font-serif text-[16px] font-semibold tracking-tight outline-none focus-visible:underline line-clamp-2"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
          {date.time}
          {venue ? ` · ${venue}` : ""}
        </p>
        <div className="mt-2 flex items-center gap-2">
          {cat && (
            <Chip color={cat.color} className="uppercase tracking-wide">
              {cat.name}
            </Chip>
          )}
          <TrustChip signal={eventTrust(event)} />
          {event.is_free ? (
            <span className="text-[11px] font-medium" style={{ color: "var(--app-positive)" }}>
              Free
            </span>
          ) : event.price_text && (
            <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              {event.price_text}
            </span>
          )}
          {event.distance_m !== undefined && (
            <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {formatDistance(event.distance_m)}
            </span>
          )}
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center self-start">
        <EventActions event={event} />
        <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
      </div>
    </article>
  );
}
