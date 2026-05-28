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
  Music,
  Palette,
  Apple,
  Baby,
  Trees,
  Utensils,
  Theater,
  Activity,
  ShoppingBag,
  CalendarDays,
} from "lucide-react";

function CategoryIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  switch (name) {
    case "Music":
      return <Music className={className} style={style} />;
    case "Palette":
      return <Palette className={className} style={style} />;
    case "Apple":
      return <Apple className={className} style={style} />;
    case "Baby":
      return <Baby className={className} style={style} />;
    case "Trees":
      return <Trees className={className} style={style} />;
    case "Utensils":
      return <Utensils className={className} style={style} />;
    case "Theater":
      return <Theater className={className} style={style} />;
    case "Activity":
      return <Activity className={className} style={style} />;
    case "ShoppingBag":
      return <ShoppingBag className={className} style={style} />;
    default:
      return <CalendarDays className={className} style={style} />;
  }
}

export default function EventCard({
  event,
  variant = "row",
}: {
  event: EventWithMeta;
  variant?: "row" | "tile" | "feature";
}) {
  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  const now = new Date();
  const isLive = new Date(event.starts_at) <= now && new Date(event.ends_at) >= now;

  // Feature variant — the editorial lead card for a horizon group.
  if (variant === "feature") {
    const accent = cat?.color ?? "var(--app-brand, #C4451C)";
    const hasPhoto = Boolean(event.hero_image);
    return (
      <article className="tactile tactile-feature tactile-interactive group relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--app-bg-sunken)]">
          {hasPhoto ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- proxied/remote venue photo; plain img avoids a domain allowlist for the key-safe proxy */}
              <img
                src={event.hero_image}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[700ms] ease-out group-hover:scale-105"
              />
            </>
          ) : (
            <div
              aria-hidden
              className="absolute inset-0 flex items-center justify-center transition-all duration-300"
              style={{
                background: `radial-gradient(120% 120% at 30% 20%, ${accent}25, ${accent}05 80%)`,
              }}
            >
              <CategoryIcon
                name={cat?.icon ?? "CalendarDays"}
                className="h-16 w-16 opacity-[0.14] transition-transform duration-300 group-hover:scale-110"
                style={{ color: accent }}
              />
            </div>
          )}
          
          {/* Dark Overlay for Text Legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* Floating Date Badge (Top Left) */}
          <div
            className="absolute left-3 top-3 z-10 flex flex-col items-center justify-center rounded-[var(--app-radius-md)] px-2.5 py-1.5 text-center border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
            style={{
              background: "rgba(20, 20, 18, 0.75)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/95">
              {date.month}
            </span>
            <span className="font-serif text-[18px] font-bold leading-none text-white my-0.5">
              {date.day}
            </span>
            <span className="text-[9px] font-medium text-white/80">
              {date.weekday}
            </span>
          </div>

          {/* Floating Category Chip (Top Right) */}
          {cat && (
            <span
              className="absolute right-3 top-3 z-10 inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
              style={{
                background: "rgba(20, 20, 18, 0.75)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                borderColor: `${accent}40`,
              }}
            >
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
              {cat.name}
            </span>
          )}

          {/* Content Overlaid at Bottom */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-4">
            <div className="flex items-center gap-2">
              {isLive && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-danger)" }}>
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--app-danger)] animate-pulse" />
                  Live
                </span>
              )}
              {event.is_free && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/90 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-sm">
                  Free
                </span>
              )}
            </div>

            <div className="mt-1.5">
              <Link
                href={`/events/${event.slug}`}
                className="line-clamp-2 font-serif text-[20px] sm:text-[22px] font-semibold leading-tight tracking-tight text-white outline-none hover:underline"
              >
                <span className="absolute inset-x-0 top-0 bottom-0" aria-hidden />
                {event.title}
              </Link>
              <p className="mt-1.5 line-clamp-1 text-[12px] text-white/80">
                {date.time}
                {event.venue_name ? ` · ${event.venue_name}` : ""}
              </p>
            </div>

            {/* Card Footer: trust signals and optional distance */}
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-white/70">
              <TrustChip signal={eventTrust(event)} />
              {event.distance_m !== undefined && (
                <span className="text-[11px] tabular-nums text-white/80">
                  {formatDistance(event.distance_m)}
                </span>
              )}
            </div>
          </div>
          
          {/* Floating Actions on upper right/bottom right */}
          <div className="absolute right-3 bottom-3 z-20 flex items-center gap-1">
            <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
          </div>
        </div>
      </article>
    );
  }

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
      <article className="tactile tactile-interactive group relative flex flex-col overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] h-full">
        {/* Header Block with responsive aspect ratio (2/1 on mobile, 16/10 on tablet/desktop) */}
        <div className="relative aspect-[2/1] sm:aspect-[16/10] w-full overflow-hidden bg-[var(--app-bg-sunken)]">
          {hasPhoto ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- proxied/remote venue photo; plain img avoids a domain allowlist for the key-safe proxy */}
              <img
                src={event.hero_image}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15" />
            </>
          ) : (
            <div
              aria-hidden
              className="absolute inset-0 flex items-center justify-center transition-all duration-300"
              style={{
                background: `radial-gradient(120% 120% at 30% 20%, ${accent}1a, ${accent}02 80%)`,
              }}
            >
              <CategoryIcon
                name={cat?.icon ?? "CalendarDays"}
                className="h-10 w-10 opacity-[0.14] transition-transform duration-300 group-hover:scale-110"
                style={{ color: accent }}
              />
            </div>
          )}

          {/* Floating Date Badge (Top Left) */}
          <div
            className="absolute left-3 top-3 z-10 flex flex-col items-center justify-center rounded-[var(--app-radius-md)] px-2.5 py-1.5 text-center shadow-[var(--app-shadow-2)] border border-white/10"
            style={{
              background: "rgba(20, 20, 18, 0.75)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/95">
              {date.month}
            </span>
            <span className="font-serif text-[18px] font-bold leading-none text-white my-0.5">
              {date.day}
            </span>
            <span className="text-[9px] font-medium text-white/80">
              {date.weekday}
            </span>
          </div>

          {/* Save Button (Top Right) */}
          <div className="absolute right-3 top-3 z-10">
            <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 flex-col p-3.5">
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-danger)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--app-danger)] animate-pulse" />
                Live
              </span>
            )}
            {cat && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: cat.color }}
              >
                {cat.name}
              </span>
            )}
            {event.is_free && (
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-positive)" }}>
                Free
              </span>
            )}
          </div>

          <div className="mt-1.5 flex-1">
            <Link
              href={`/events/${event.slug}`}
              className="line-clamp-2 font-serif text-[15.5px] font-semibold leading-snug tracking-tight outline-none hover:underline"
              style={{ color: "var(--app-ink)" }}
            >
              <span className="absolute inset-x-0 top-0 bottom-0" aria-hidden />
              {event.title}
            </Link>
            <p className="mt-1.5 line-clamp-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              {date.time}
              {event.venue_name ? ` · ${event.venue_name}` : ""}
            </p>
          </div>

          {/* Card Footer: trust signals and optional distance */}
          <div className="mt-3 flex items-center justify-between border-t pt-2.5" style={{ borderColor: "var(--app-border)" }}>
            <TrustChip signal={eventTrust(event)} />
            {event.distance_m !== undefined && (
              <span className="text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
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
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded-[var(--app-radius-sm)] border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: "color-mix(in srgb, var(--app-danger) 12%, transparent)", color: "var(--app-danger)", borderColor: "color-mix(in srgb, var(--app-danger) 20%, transparent)" }}>
              <span className="h-1 w-1 rounded-full bg-[color:var(--app-danger)] animate-pulse" />
              Live
            </span>
          )}
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
