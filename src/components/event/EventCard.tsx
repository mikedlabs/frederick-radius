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

export default function EventCard({
  event,
  variant = "row",
}: {
  event: EventWithMeta;
  variant?: "row" | "tile";
}) {
  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];

  // Photo-forward tile for a 2-up grid — the anti-directory card. Image
  // leads, date badge overlays it, tight text below. Falls back to a
  // colored date block when there is no real photo (never fabricated).
  if (variant === "tile") {
    return (
      <article className="tactile tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)]">
        <div className="relative h-[96px] w-full overflow-hidden bg-[var(--app-bg-sunken)]">
          {event.hero_image ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- proxied/remote venue photo; plain img avoids a domain allowlist for the key-safe proxy */}
              <img
                src={event.hero_image}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            </>
          ) : (
            <div
              aria-hidden
              className="flex h-full w-full items-center justify-center"
              style={{
                background: `radial-gradient(120% 120% at 30% 20%, ${(cat?.color ?? "#C4451C")}2e, ${(cat?.color ?? "#C4451C")}0a 70%)`,
              }}
            >
              <span className="font-serif text-3xl font-semibold" style={{ color: cat?.color ?? "var(--app-brand)" }}>
                {date.day}
              </span>
            </div>
          )}
          <span className="absolute left-2 top-2 inline-flex items-baseline gap-1 rounded-full bg-black/65 px-2 py-0.5 text-white backdrop-blur-sm">
            <span className="text-[9px] font-bold uppercase tracking-wide">{date.month}</span>
            <span className="text-[12px] font-semibold leading-none">{date.day}</span>
          </span>
        </div>
        <div className="space-y-0.5 px-2.5 py-2">
          <Link
            href={`/events/${event.slug}`}
            className="block truncate text-[13.5px] font-semibold tracking-tight outline-none focus-visible:underline"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
          <p className="truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {date.time} · {event.venue_name}
          </p>
          {event.is_free && (
            <p className="text-[10px] font-semibold" style={{ color: "var(--app-positive)" }}>
              Free
            </p>
          )}
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
            className="text-[15px] font-semibold tracking-tight outline-none focus-visible:underline line-clamp-2"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
          {date.time} · {event.venue_name}
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
