import { Receipt, Hammer } from "lucide-react";
import {
  COST_LINES,
  COST_LAST_UPDATED,
  totalMonthlyUsd,
  BUILD_LINES,
  BUILD_STARTED,
  totalBuildMarketUsd,
} from "@/data/cost-transparency";

function formatThousands(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * CostTransparency — what Frederick Radius costs to run AND what it
 * cost to build, in plain English, on /trust.
 *
 * Two sections in one card:
 *   1. What it costs to run    — ongoing API + hosting line items
 *   2. What it cost to build   — design + engineering + data + brand
 *                                hours, with a midpoint market-
 *                                equivalent value, donated to the
 *                                project
 *
 * Civic credibility move. Builds trust as a tool, not a startup: a
 * resident who tapped /trust to figure out where the data comes from
 * gets one more honest read here ("here's what keeps it online +
 * what it took to build it").
 *
 * Visual register matches the rest of /trust: paper card, eyebrow
 * pill, no dollar-sign salesmanship. The headline numbers sit at the
 * top of each section so the answer to "how much" lands before the
 * breakdown.
 */
export default function CostTransparency() {
  const monthly = Math.round(totalMonthlyUsd());
  const build = totalBuildMarketUsd();
  const buildLow = Math.round(build.low / 1000);
  const buildHigh = Math.round(build.high / 1000);
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
            className="text-[11px] font-bold uppercase tracking-[0.12em]"
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
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            Frederick Radius runs on a handful of services, most of
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
                  className="mt-1 text-[11px]"
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
        className="mt-4 text-[11px]"
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

      {/* ── Build cost — what it took to make ────────────────────
          The honest companion to the runtime breakdown above. Same
          editorial register: civic, not VC. The dollar number is
          market-EQUIVALENT — work that was donated to the project,
          not money owed. */}
      <div
        className="mt-6 border-t pt-5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <header className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
              color: "var(--app-brand)",
            }}
          >
            <Hammer className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              What it cost to build
            </p>
            <h3
              className="font-serif text-[18px] font-semibold leading-snug tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              About {formatThousands(build.hours)} hours since {BUILD_STARTED}.
            </h3>
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: "var(--app-ink-2)" }}
            >
              At typical 2026 mid-Atlantic agency rates for this kind
              of work, the build commissions for roughly{" "}
              <strong style={{ color: "var(--app-ink)" }}>
                ${formatThousands(buildLow)}k–${formatThousands(buildHigh)}k
              </strong>
              . It was donated to the project. Frederick Radius
              doesn&apos;t take ad revenue or investor money.
            </p>
          </div>
        </header>

        <ul className="mt-4 divide-y" style={{ borderColor: "var(--app-border)" }}>
          {BUILD_LINES.map((line) => {
            const lo = Math.round((line.hours * line.rate_low_usd) / 100) / 10;
            const hi = Math.round((line.hours * line.rate_high_usd) / 100) / 10;
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
                    className="mt-1 text-[11px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {line.who} · {formatThousands(line.hours)} hours @ ${line.rate_low_usd}–${line.rate_high_usd}/hr
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                  style={{
                    background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
                    color: "var(--app-brand)",
                  }}
                >
                  ${lo}k–${hi}k
                </span>
              </li>
            );
          })}
        </ul>

        <p
          className="mt-4 text-[11px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Hours are owner-estimated, not pulled from a time tracker.
          Rates reflect 2026 mid-Atlantic agency norms. The donated-
          labor framing is intentional: this number is here so you
          can see real work went in, not to suggest debt.
        </p>
      </div>
    </section>
  );
}
