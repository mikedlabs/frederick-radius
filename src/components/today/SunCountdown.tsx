import { Sunrise, Sunset, Sun } from "lucide-react";
import { sunTimes, FREDERICK_LAT, FREDERICK_LNG } from "@/lib/almanac";

/**
 * SunCountdown — a tiny editorial chip with the next sun event:
 * sunrise, sunset, or golden hour. Pure math: NOAA's solar formulas
 * for Frederick's latitude/longitude, no network, no allocation.
 * Renders one line so it can tuck into the hero strip without
 * stealing real estate.
 *
 * Golden hour is defined as the hour straddling sunset (-/+30min)
 * here — photographer's heuristic that survives the latitude band
 * Frederick sits in. We surface it explicitly when the user is
 * inside that window because it's the moment the SkyHero gradient
 * is most alive and the app can say "go look outside."
 *
 * The underlying sunrise/sunset algorithm now lives in
 * `@/lib/almanac` so the AlmanacFooter on /now can share it without
 * duplicating ~50 lines of orbital math.
 */

function formatGap(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  return `${Math.round(h / 24)}d`;
}

function formatClock(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default function SunCountdown({
  tone = "light",
  now = new Date(),
}: {
  tone?: "light" | "dark";
  now?: Date;
}) {
  const today = sunTimes(now, FREDERICK_LAT, FREDERICK_LNG);
  if (!today) return null;

  const ink = tone === "dark" ? "rgba(255,255,255,0.92)" : "var(--app-ink-2)";
  const subInk = tone === "dark" ? "rgba(255,255,255,0.65)" : "var(--app-ink-3)";

  // What's coming next?
  let icon: typeof Sun;
  let label: string;
  let when: Date;

  if (now < today.sunrise) {
    icon = Sunrise;
    label = "Sunrise";
    when = today.sunrise;
  } else if (now < today.sunset) {
    // Golden-hour window: ±30 min around sunset.
    const goldenStart = new Date(today.sunset.getTime() - 30 * 60_000);
    if (now >= goldenStart) {
      icon = Sun;
      label = "Golden hour: sunset";
      when = today.sunset;
    } else {
      icon = Sunset;
      label = "Sunset";
      when = today.sunset;
    }
  } else {
    // After sunset: surface tomorrow's sunrise.
    const tomorrow = new Date(now.getTime() + 86_400_000);
    const t = sunTimes(tomorrow, FREDERICK_LAT, FREDERICK_LNG);
    if (!t) return null;
    icon = Sunrise;
    label = "Sunrise";
    when = t.sunrise;
  }

  const Icon = icon;
  const gap = formatGap(when.getTime() - now.getTime());
  const clock = formatClock(when);

  return (
    <p
      className="inline-flex items-center gap-1.5 text-[12px] font-medium"
      style={{ color: ink }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span>{label} in {gap}</span>
      <span style={{ color: subInk }}>· {clock}</span>
    </p>
  );
}
