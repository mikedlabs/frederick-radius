import { Navigation, CalendarClock, ArrowRight } from "lucide-react";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";
import { readModeFromCookie } from "@/lib/mode-server";

/**
 * The home's single primary action. One headline, one subhead, one
 * button. Two axes drive the copy:
 *
 *   - Time of day (America/New_York hour): before 4pm the job is
 *     "what is open near me" → /radius; from 4pm on it's "plan my
 *     evening" → /tonight.
 *   - Mode (Visitor / Resident): Visitor reads warmer + more
 *     orientation-friendly; Resident reads more familiar + concise.
 *     Mode comes from the same cookie AdaptiveGreeting uses so both
 *     surfaces speak in the same voice on the first paint.
 *
 * Built on Surface + Button + the display type token. Pure server
 * component — the cookie read makes Today dynamic-per-request, which
 * was already the case via the NWS forecast fetch.
 */
function etHour(now: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(now),
    10,
  );
}

export default async function PrimaryActionCard({ now = new Date() }: { now?: Date }) {
  const evening = etHour(now) >= 16;
  const mode = await readModeFromCookie();
  const visitor = mode === "visitor";

  const copy = evening
    ? {
        headline: visitor ? "Plan tonight in one tap" : "Tonight, walkable",
        subhead: visitor
          ? "Dinner, drinks, then somewhere to land late. All walkable."
          : "Dinner, drinks, late spot. Routed by foot.",
        cta: visitor ? "See tonight's plan" : "Tonight's plan",
        href: "/tonight",
        Icon: CalendarClock,
      }
    : {
        headline: visitor ? "What is open near you" : "What's open right now",
        subhead: visitor
          ? "Coffee, food, parks, and trails open within your radius right now."
          : "Coffee, food, parks, trails. Open-now filtered.",
        cta: visitor ? "Open near me" : "Show me",
        href: "/radius",
        Icon: Navigation,
      };

  return (
    <Surface elevation={2} radius="var(--app-radius-lg)" className="tactile-feature p-5">
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-md)]"
          style={{
            background: "color-mix(in srgb, var(--app-brand) 14%, var(--app-bg-elevated))",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-brand) 30%, transparent)",
          }}
          aria-hidden
        >
          <copy.Icon className="h-5 w-5" strokeWidth={2} style={{ color: "var(--app-brand)" }} />
        </span>
        <div className="min-w-0">
          <h2 className="display-2" style={{ color: "var(--app-ink)" }}>
            {copy.headline}
          </h2>
          <p className="mt-1 text-[14px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {copy.subhead}
          </p>
        </div>
      </div>
      <Button
        href={copy.href}
        variant="primary"
        size="lg"
        className="mt-4 w-full"
        iconRight={<ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
      >
        {copy.cta}
      </Button>
    </Surface>
  );
}
