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
import {
  Music, Palette, Theater, Baby, Apple, Landmark, Image as ImageIcon,
  Utensils, Trees, ShoppingBag, Activity, Heart, Building, GraduationCap,
  CalendarDays, BookOpen, Wine, Beer, Coffee, Sparkles,
} from "lucide-react";

// Resolve a category-icon string from src/data/categories.ts into a
// lucide component. Used as a large ghosted watermark on no-photo
// event tiles so a music event tile reads differently from a civic
// one even without a photo. Defaults to CalendarDays for unmapped.
const ICON_BY_NAME: Record<string, typeof Music> = {
  Music, Palette, Theater, Baby, Apple, Landmark, ImageIcon,
  Utensils, Trees, ShoppingBag, Activity, Heart, Building,
  GraduationCap, BookOpen, Wine, Beer, Coffee, Sparkles,
};

export default function EventCard({
  event,
  variant = "row",
}: {
  event: EventWithMeta;
  variant?: "row" | "tile" | "feature";
}) {
  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  // Accent MUST be a hex literal — used in templates like `${accent}38`
  // to compose color-with-alpha. A CSS var() fallback would produce
  // invalid CSS. Generic-category fallback uses the civic blue so
  // county / civic-affairs items read as the quiet-utility category
  // they are, instead of borrowing the brand brick.
  const accent: string = cat?.color ?? "#2A5D8F";
  const hasPhoto = Boolean(event.hero_image);
  const categoryLabel = cat?.name ?? (event.category ? event.category : "Civic");

  // Feature variant — the editorial lead card for a horizon group when
  // we have a real photo. Full-bleed image, big serif headline, scrim
  // overlay, date badge top-left. One per group, by design.
  if (variant === "feature") {
    return (
      <article className="tactile tactile-feature tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-lg)]">
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxied/remote venue photo
            <img
              src={event.hero_image}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background: `radial-gradient(120% 80% at 20% 10%, ${accent}70, transparent 60%), linear-gradient(165deg, ${accent}48, ${accent}15)`,
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div
            className="absolute left-3 top-3 inline-flex items-baseline gap-1.5 rounded-[var(--app-radius-sm)] bg-white/95 px-2 py-1 leading-none"
            style={{ color: accent }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {date.month}
            </span>
            <span className="font-serif text-[18px] font-semibold">{date.day}</span>
            <span className="text-[10px] font-medium opacity-80">{date.weekday}</span>
          </div>
          <span
            className="absolute right-3 top-3 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
            style={{ background: accent }}
          >
            {categoryLabel}
          </span>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <Link
              href={`/events/${event.slug}`}
              className="line-clamp-2 font-serif text-[22px] font-semibold leading-tight tracking-tight text-white outline-none focus-visible:underline"
            >
              <span className="absolute inset-0" aria-hidden />
              {event.title}
            </Link>
            <p className="mt-1 truncate text-[12px] text-white/85">
              {date.time}
              {event.venue_name ? ` · ${event.venue_name}` : ""}
            </p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-white/80">
              {event.is_free && (
                <span
                  className="rounded-full bg-white/15 px-2 py-0.5 font-semibold backdrop-blur-sm"
                  style={{ color: "white" }}
                >
                  Free
                </span>
              )}
              {event.price_text && !event.is_free && (
                <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold backdrop-blur-sm">
                  {event.price_text}
                </span>
              )}
              {event.distance_m !== undefined && (
                <span className="ml-auto tabular-nums">
                  {formatDistance(event.distance_m)}
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  }

  // Tile variant — the workhorse grid card. Three modes by data shape:
  //   1. has photo: photo banner on top, date badge overlay, content below
  //   2. no photo, civic/quiet category: typographic block with color band
  //   3. no photo, marquee category: tinted gradient block
  // The category color is visible in every state, so a music event reads
  // differently from a planning meeting at a glance.
  if (variant === "tile") {
    return (
      <article className="tactile tactile-interactive group relative flex h-full flex-col overflow-hidden rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)]">
        {/* Banner — photo, or category-tinted gradient with the date in
            big serif. Same height in both modes so the grid stays aligned. */}
        <div className="relative h-[112px] w-full overflow-hidden">
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxied/remote venue photo
            <img
              src={event.hero_image}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <>
              {/* Editorial poster fallback when no photo is available.
                  A dramatic two-stop diagonal gradient + dot-grid
                  texture + a large ghosted category icon, rotated 8°
                  and parked in the lower-right. Same pattern as the
                  Tonight rail's no-photo cards — gives every tile a
                  distinctive identity instead of a flat color block. */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(140deg, color-mix(in srgb, ${accent} 75%, #1a1820) 0%, color-mix(in srgb, ${accent} 36%, #1a1820) 55%, color-mix(in srgb, ${accent} 8%, #1a1820) 100%)`,
                }}
              />
              {/* Dot-grid overlay — subtle paper grain, NOT diagonal
                  stripes which were reading as a barcode at small size. */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
                  backgroundSize: "10px 10px",
                  mixBlendMode: "overlay",
                }}
              />
              {/* Large ghosted category icon — the visual identity. */}
              {(() => {
                const Icon = ICON_BY_NAME[cat?.icon ?? ""] ?? CalendarDays;
                return (
                  <Icon
                    aria-hidden
                    className="absolute -bottom-2 -right-2 h-[90px] w-[90px]"
                    strokeWidth={1.25}
                    style={{
                      color: "white",
                      opacity: 0.18,
                      transform: "rotate(8deg)",
                    }}
                  />
                );
              })()}
            </>
          )}
          {hasPhoto && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
          )}
          {/* Date badge — top-left. Photo: white pill, category color
              text. No photo: white text directly on the now-darker
              gradient, with a soft drop shadow so it's legible. */}
          <div
            className={
              hasPhoto
                ? "absolute left-2.5 top-2.5 inline-flex items-baseline gap-1 rounded-[var(--app-radius-sm)] bg-white/95 px-1.5 py-0.5 leading-none shadow-[var(--app-shadow-1)]"
                : "absolute left-3 top-3 inline-flex items-baseline gap-1 leading-none"
            }
            style={
              hasPhoto
                ? { color: accent }
                : { color: "white", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }
            }
          >
            <span className="text-[9px] font-bold uppercase tracking-wider">
              {date.month}
            </span>
            <span className="font-serif text-[18px] font-semibold">{date.day}</span>
            <span className="text-[9px] font-medium opacity-80">{date.weekday}</span>
          </div>
          {/* Category chip — top-right, ALWAYS shown so users can tell
              event type at a glance. White-on-translucent for no-photo
              so it reads on the dark poster gradient. */}
          <span
            className="absolute right-2.5 top-2.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur"
            style={{
              background: hasPhoto ? accent : "rgba(255,255,255,0.20)",
              color: "white",
              boxShadow: hasPhoto ? "none" : "inset 0 0 0 1px rgba(255,255,255,0.22)",
            }}
          >
            {categoryLabel}
          </span>
          {/* Category color band on the bottom edge — the through-line
              that makes a music tile visually distinct from a civic one. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[3px]"
            style={{ background: accent }}
          />
        </div>
        {/* Body */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
          <Link
            href={`/events/${event.slug}`}
            className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight outline-none focus-visible:underline"
            style={{ color: "var(--app-ink)" }}
          >
            <span className="absolute inset-0" aria-hidden />
            {event.title}
          </Link>
          <p className="truncate text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            <span style={{ color: "var(--app-ink-2)" }}>{date.time}</span>
            {event.venue_name ? <> · {event.venue_name}</> : null}
          </p>
          <div className="mt-auto flex items-center gap-1.5 pt-1 text-[10.5px]">
            {event.is_free && (
              <span className="font-semibold" style={{ color: "var(--app-positive)" }}>
                Free
              </span>
            )}
            {event.price_text && !event.is_free && (
              <span style={{ color: "var(--app-ink-3)" }}>{event.price_text}</span>
            )}
            {event.distance_m !== undefined && (
              <span className="ml-auto tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                {formatDistance(event.distance_m)}
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
