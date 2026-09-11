import Link from "next/link";
import { getActiveMajorEvent } from "@/data/major-events";

export default function MajorEventTakeover() {
  const now = new Date();
  const activeEventData = getActiveMajorEvent(now);

  if (!activeEventData) return null;

  const { event, isLive, daysOut } = activeEventData;
  const headline = isLive ? event.getLiveHeadline(now) : event.getHypeHeadline(daysOut);
  const subline = isLive ? event.getLiveSubline(now) : event.getHypeSubline(daysOut);

  return (
    <div className="mt-6 mb-2">
      <Link href={event.url} className="block relative overflow-hidden rounded-[var(--app-radius-lg)] border transition hover:scale-[0.99] active:scale-[0.97]"
        style={{
          borderColor: event.theme_color,
          background: `color-mix(in srgb, ${event.theme_color} 10%, var(--app-bg-elevated))`,
          boxShadow: `var(--app-elev-2), 0 4px 20px -6px color-mix(in srgb, ${event.theme_color} 40%, transparent)`,
        }}
      >
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white text-xl shadow-sm"
              style={{ backgroundColor: event.theme_color }}>
              {event.icon}
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: event.theme_color }}>
                {isLive ? `${event.title} is ON` : "Coming Soon"}
              </span>
              <h2 className="mt-0.5 truncate text-lg font-bold text-[var(--app-ink)]">
                {headline}
              </h2>
              <p className="mt-0.5 truncate text-[13px] text-[var(--app-ink-2)]">
                {subline}
              </p>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
