import Link from "next/link";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDateBlock } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import SaveButton from "@/components/saved/SaveButton";
import { formatDistance } from "@/lib/geo";

export default function EventCard({ event }: { event: EventWithMeta }) {
  const date = eventDateBlock(event);
  const cat = CATEGORY_BY_SLUG[event.category];
  return (
    <article
      className="group relative flex items-stretch gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)] transition hover:shadow-[var(--app-shadow-2)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div
        aria-hidden
        className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-[var(--app-radius-md)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
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
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{
              color: cat?.color ?? "var(--app-brand)",
              background: `${cat?.color ?? "#C4451C"}14`,
            }}
          >
            {cat?.name ?? event.category}
          </span>
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
      <div className="relative z-10 self-start">
        <SaveButton refType="event" refId={event.slug} label={`Save ${event.title}`} />
      </div>
    </article>
  );
}
