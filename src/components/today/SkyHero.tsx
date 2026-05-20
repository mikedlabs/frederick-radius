/**
 * Time-of-day animated sky behind the Today hero.
 * Server-rendered: palette is derived from the current hour in America/New_York
 * so the first paint matches local Frederick time without a flash.
 */

export type SkyTone = "light" | "dark";
type Sky = { top: string; mid: string; bottom: string; tone: SkyTone };

/**
 * Server-safe helper for the current Eastern-time hour's sky tone.
 * Exposed so other components rendered alongside SkyHero (e.g.
 * WeeklyForecast tucked into the hero region) can color-match
 * without re-deriving the hour. Mirrors paletteForHour's tone tier.
 */
export function currentSkyTone(now: Date = new Date()): SkyTone {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
    10,
  );
  return paletteForHour(h).tone;
}

function paletteForHour(h: number): Sky {
  // Pre-dawn (3–5)
  if (h >= 3 && h < 6) return { top: "#1B1E3A", mid: "#2E3258", bottom: "#5C4F6E", tone: "dark" };
  // Sunrise (6–7)
  if (h >= 6 && h < 8) return { top: "#F5C28C", mid: "#F08770", bottom: "#B85C8B", tone: "light" };
  // Morning (8–10)
  if (h >= 8 && h < 11) return { top: "#A8D8F0", mid: "#C7E5F2", bottom: "#F0E8D8", tone: "light" };
  // Midday (11–14)
  if (h >= 11 && h < 15) return { top: "#7CB9E8", mid: "#A8D0EE", bottom: "#E8E4D5", tone: "light" };
  // Afternoon (15–17)
  if (h >= 15 && h < 18) return { top: "#7CA8D8", mid: "#D8B888", bottom: "#E5C99A", tone: "light" };
  // Golden hour (18–19)
  if (h >= 18 && h < 20) return { top: "#D88860", mid: "#E8A878", bottom: "#F5C898", tone: "light" };
  // Twilight (20–21)
  if (h >= 20 && h < 22) return { top: "#3D3460", mid: "#7A5680", bottom: "#C97B7B", tone: "dark" };
  // Night (22–2)
  return { top: "#0F1428", mid: "#1F2444", bottom: "#3A3458", tone: "dark" };
}

export default function SkyHero({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const nyHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
  const sky = paletteForHour(nyHour);

  return (
    <section
      className={`sky-hero -mx-4 -mt-4 px-4 pb-8 pt-6 sm:rounded-b-[var(--app-radius-xl)] ${className}`}
      style={
        {
          "--sky-top": sky.top,
          "--sky-mid": sky.mid,
          "--sky-bottom": sky.bottom,
          color: sky.tone === "dark" ? "#F4F2EE" : "#1A1A1A",
        } as React.CSSProperties
      }
      data-sky-tone={sky.tone}
    >
      {children}
    </section>
  );
}
