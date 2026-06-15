import Link from "next/link";
import { Footprints } from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { buildMoveStack } from "@/lib/moveStack";

/**
 * MoveStack — the "plan for your next few hours" itinerary on /today.
 * One confident sequence (dinner → drinks → music) instead of a wall of
 * options, ranked by editorial score + proximity, weather- and
 * time-of-day-aware. Renders as a compact numbered timeline; hides
 * itself if fewer than two stops resolve. Server component; the NWS
 * fetch is cached/shared with the rest of the page.
 */
export default async function MoveStack() {
  const now = new Date();
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const cond = (forecast?.hourly?.[0]?.shortForecast ?? "").toLowerCase();
  const wet = /rain|shower|drizzle|thunder|storm|snow|sleet|wintry/.test(cond);
  const stack = buildMoveStack(now, { wet });
  if (!stack) return null;

  return (
    <section
      aria-label={stack.title}
      className="deck-card rounded-[var(--app-radius-lg)] p-4"
      style={{ background: "var(--app-bg-elevated)" }}
    >
      <header className="mb-3">
        <h2
          className="font-serif text-[18px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {stack.title}
        </h2>
        <p className="text-meta-lg" style={{ color: "var(--app-ink-3)" }}>
          {stack.intro}
        </p>
      </header>

      <ol className="relative">
        {stack.steps.map((s, i) => {
          const last = i === stack.steps.length - 1;
          return (
            <li key={s.n} className="relative flex gap-3 pb-3 last:pb-0">
              {/* connector line behind the number dots */}
              {!last && (
                <span
                  aria-hidden
                  className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px"
                  style={{ background: "var(--app-border)" }}
                />
              )}
              <span
                aria-hidden
                className="relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums"
                style={{ background: "var(--app-brand)", color: "#fff" }}
              >
                {s.n}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {s.verb}
                </p>
                <div className="flex items-baseline justify-between gap-2">
                  {s.slug ? (
                    <Link
                      href={`/places/${s.slug}`}
                      className="text-[15px] font-semibold leading-tight underline-offset-2 hover:underline"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {s.name}
                    </Link>
                  ) : (
                    <span
                      className="text-[15px] font-semibold leading-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {s.name}
                    </span>
                  )}
                  {typeof s.walkMin === "number" && (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      <Footprints className="h-3 w-3" strokeWidth={2} aria-hidden />
                      {s.walkMin}m
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-2 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        A suggested plan from what&rsquo;s downtown. Check hours before you go.
      </p>
    </section>
  );
}
