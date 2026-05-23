import { Navigation, CalendarClock, ArrowRight } from "lucide-react";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";

/**
 * The home's single primary action. One headline, one subhead, one
 * button, time-aware on local (America/New_York) hour: before 4pm the
 * job is "what is open near me" -> /radius; from 4pm on it shifts to
 * "plan my evening" -> /plan. Built only from Surface + Button + the
 * display type token.
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

export default function PrimaryActionCard({ now = new Date() }: { now?: Date }) {
  const evening = etHour(now) >= 16;
  const copy = evening
    ? {
        headline: "Plan tonight in one tap",
        subhead: "Dinner, drinks, then somewhere to land late — all walkable.",
        cta: "See tonight's plan",
        href: "/tonight",
        Icon: CalendarClock,
      }
    : {
        headline: "What is open near you",
        subhead: "Coffee, food, parks, and trails open within your radius right now.",
        cta: "Open near me",
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
