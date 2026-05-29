import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";

/**
 * TodayActions — the two situational next-steps for the Today hook,
 * rendered on PAPER directly below the SkyHero (not floating on the sky
 * gradient, where buttons read as out-of-place). The primary action
 * changes by daypart so the first tap is always relevant; the map is
 * always one tap away.
 *
 * Server component — daypart is the Eastern-time hour, same clock the
 * rest of the page uses.
 */
function easternHour(now: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
    10,
  );
}

export default function TodayActions() {
  const h = easternHour(new Date());
  const primary =
    h >= 5 && h < 11
      ? { label: "Find coffee", href: "/map?mode=browse&intent=coffee" }
      : h >= 17 || h < 5
        ? { label: "What's tonight", href: "/today?t=tonight" }
        : { label: "Open now nearby", href: "/map?mode=browse&open=now" };

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={primary.href}
        className="tactile-interactive inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-meta-lg font-semibold transition active:scale-[0.96]"
        style={{
          background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
          color: "var(--app-brand)",
        }}
      >
        {primary.label}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </Link>
      <Link
        href="/map"
        className="tactile-interactive inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-meta-lg font-semibold transition active:scale-[0.96]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
      >
        <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        Open map
      </Link>
    </div>
  );
}
