import { Receipt } from "lucide-react";
import { COST_LINES, COST_LAST_UPDATED, totalMonthlyUsd } from "@/data/cost-transparency";

/**
 * CostTransparency — what Frederick Radius costs to run, in plain
 * English, on /trust.
 *
 * Civic credibility move. Builds trust as a tool, not a startup: a
 * resident who tapped /trust to figure out where the data comes from
 * gets one more honest read here ("here's what keeps it online").
 *
 * Visual register matches the rest of /trust: paper card, eyebrow
 * pill, no dollar-sign salesmanship. The line items are quiet rows;
 * the headline total sits at the top so the answer to "how much"
 * lands before the breakdown.
 */
export default function CostTransparency() {
  const monthly = Math.round(totalMonthlyUsd());
  return (
    <section
      aria-labelledby="cost-transparency-heading"
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-5"
      style={{ borderColor: "var(--app-border)" }}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
            color: "var(--app-cool)",
          }}
        >
          <Receipt className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            What it costs to run
          </p>
          <h2
            id="cost-transparency-heading"
            className="font-serif text-[18px] font-semibold leading-snug tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            About ${monthly}/month, mostly the Google Places API.
          </h2>
          <p
            className="mt-1 text-[12.5px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            Frederick Radius runs on a handful of services — most of
            them on free tiers right now. The honest numbers, updated
            when bills land:
          </p>
        </div>
      </header>

      <ul className="mt-4 divide-y" style={{ borderColor: "var(--app-border)" }}>
        {COST_LINES.map((line) => {
          const isFree = line.cost_usd === 0;
          const displayCost = isFree
            ? "Free tier"
            : line.cadence === "annual"
              ? `$${line.cost_usd}/yr`
              : line.cadence === "one-time"
                ? `$${line.cost_usd}`
                : `$${line.cost_usd}/mo`;
          return (
            <li
              key={line.label}
              className="flex items-start gap-3 py-3"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="font-semibold leading-tight text-[13px]"
                  style={{ color: "var(--app-ink)" }}
                >
                  {line.label}
                </p>
                <p
                  className="mt-0.5 text-[12px] leading-relaxed text-pretty"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {line.description}
                </p>
                <p
                  className="mt-1 text-[10.5px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {line.source}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                style={{
                  background: isFree
                    ? "color-mix(in srgb, var(--app-positive) 14%, transparent)"
                    : "color-mix(in srgb, var(--app-brand) 12%, transparent)",
                  color: isFree ? "var(--app-positive)" : "var(--app-brand)",
                }}
              >
                {displayCost}
              </span>
            </li>
          );
        })}
      </ul>

      <p
        className="mt-4 text-[10.5px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Reconciled {COST_LAST_UPDATED}. Owner-maintained, not scraped
        from billing APIs (yet). If a number here looks wrong,{" "}
        <a
          href="mailto:hi@frederickradius.app?subject=Cost%20transparency"
          className="font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--app-cool)" }}
        >
          tell us
        </a>{" "}
        and we&apos;ll update it.
      </p>
    </section>
  );
}
