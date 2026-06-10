import { Navigation, CalendarClock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
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
        cta: visitor ? "Plan tonight" : "Plan it",
        // Routes to /plan — the dedicated planner surface that
        // walks the user through dinner → drinks → late spot. The
        // earlier href, /events?lens=tonight, just dumped a list of
        // tonight's events; the card promised a PLAN ("Plan tonight
        // in one tap") but the destination was a calendar list. The
        // MoreSheet's plan-hero also routes to /plan; now both
        // surfaces line up on the same destination.
        href: "/plan",
        Icon: CalendarClock,
      }
    : {
        headline: visitor ? "What is open near you" : "What's open right now",
        subhead: visitor
          ? "Coffee, food, parks, and trails open within your radius right now."
          : "Coffee, food, parks, trails. Open-now filtered.",
        cta: visitor ? "Open near me" : "Show me",
        href: "/explore?mode=radius",
        Icon: Navigation,
      };

  // Photo-led magazine variant. Previously a paper-cream Surface
  // with an icon stamp + headline + body; now a full-bleed
  // SeasonalPhoto hero with serif headline overlaid in white. Same
  // visual pattern as /about / /m / /events / /history heroes so
  // the whole app reads as one editorial product. The brand-color
  // CTA button stays at the bottom on solid color so it pops
  // against the photo.
  return (
    <section
      className="tactile tactile-feature relative overflow-hidden rounded-[var(--app-radius-lg)]"
      style={{
        boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)",
      }}
    >
      {/* SeasonalPhoto fills the top of the card; the bottom half is
          a solid color band that hosts the CTA button so the brand
          color reads cleanly without competing with the photo. */}
      <div className="relative h-44 w-full sm:h-52" aria-hidden>
        <SeasonalPhoto
          season="auto"
          alt=""
          sizes="(max-width: 768px) 100vw, 640px"
          className="absolute inset-0"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.28) 55%, transparent 90%)",
          }}
        />
        {/* Icon stamp in the top-left of the photo — small glass
            pill with the brand-color icon so the action signal still
            reads on the photo. */}
        <span
          aria-hidden
          className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full"
          style={{
            background: "rgba(255,255,255,0.88)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "var(--app-shadow-1)",
          }}
        >
          <copy.Icon
            className="h-[18px] w-[18px]"
            strokeWidth={2}
            style={{ color: "var(--app-brand)" }}
          />
        </span>
        {/* Headline + subhead anchored to the bottom of the photo
            on the dark gradient. Same serif treatment as the /events
            cinematic hero. */}
        <div className="absolute inset-x-0 bottom-0 space-y-1 p-4 sm:p-5">
          <h2
            className="font-serif text-[24px] font-semibold leading-tight tracking-tight text-white sm:text-[28px]"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
          >
            {copy.headline}
          </h2>
          <p
            className="text-[13px] leading-snug text-white/90 sm:text-[14px]"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
          >
            {copy.subhead}
          </p>
        </div>
      </div>
      {/* CTA band — paper-cream so the brand-color button pops, and
          the action target is a clear "do this" instead of a button
          buried inside a photo. */}
      <div className="p-4" style={{ background: "var(--app-bg-elevated)" }}>
        <Button
          href={copy.href}
          variant="primary"
          size="lg"
          className="w-full"
          iconRight={<ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
        >
          {copy.cta}
        </Button>
      </div>
    </section>
  );
}
