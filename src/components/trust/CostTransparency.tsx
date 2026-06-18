import { Hammer } from "lucide-react";
import { BUILD_LINES, BUILD_STARTED, totalBuildMarketUsd } from "@/data/cost-transparency";

function formatThousands(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * CostTransparency — what Frederick Radius cost to BUILD, in plain English, on
 * /trust. (The runtime "what it costs to run" line-item breakdown was removed
 * by owner request; this keeps the donated-labor build figure, which is the
 * civic-credibility read: real work went in, no ad revenue or investor money.)
 *
 * Visual register matches the rest of /trust: paper card, eyebrow pill, no
 * dollar-sign salesmanship. The headline number sits at the top so the answer
 * to "how much" lands before the breakdown. The dollar figure is market-
 * EQUIVALENT (work donated to the project), not money owed.
 */
export default function CostTransparency() {
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
          <h2
            id="cost-transparency-heading"
            className="font-serif text-[18px] font-semibold leading-snug tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            About {formatThousands(build.hours)} hours since {BUILD_STARTED}.
          </h2>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            At typical 2026 mid-Atlantic agency rates for this kind of work, the
            build commissions for roughly{" "}
            <strong style={{ color: "var(--app-ink)" }}>
              ${formatThousands(buildLow)}k–${formatThousands(buildHigh)}k
            </strong>
            . It was donated to the project. Frederick Radius doesn&apos;t take
            ad revenue or investor money.
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
        Hours are owner-estimated, not pulled from a time tracker. Rates reflect
        2026 mid-Atlantic agency norms. The donated-labor framing is intentional:
        this number is here so you can see real work went in, not to suggest debt.
      </p>
    </section>
  );
}
