import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { PublicCivicSignal } from "@/lib/civic-signals";

function formatUnit(value: number, unit: PublicCivicSignal["comparison"]["unit"]) {
  if (unit === "percent") return `${value.toLocaleString()}%`;
  if (unit === "days") return `${value.toLocaleString()} days`;
  if (unit === "minutes") return `${value.toLocaleString()} min`;
  return value.toLocaleString();
}

function topicLabel(topic: PublicCivicSignal["topic"]): string {
  switch (topic) {
    case "public-services":
      return "Public services";
    case "public-safety":
      return "Public safety";
    case "transportation":
      return "Transportation";
    case "planning":
      return "Planning";
    case "environment":
      return "Environment";
    case "government":
      return "Government";
  }
}

function Action({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const external = /^https?:\/\//.test(href);
  const className =
    "tap-44 mt-3 inline-flex w-full items-center justify-between rounded-full border px-4 text-[12px] font-semibold transition hover:bg-[var(--app-bg-sunken)]";
  const style = {
    borderColor: "var(--app-border-strong)",
    color: "var(--app-ink)",
  };
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={style}
      >
        {label}
        <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </a>
    );
  }
  return (
    <Link href={href} className={className} style={style}>
      {label}
      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </Link>
  );
}

export default function CivicSignalCard({
  signal,
  lead = false,
}: {
  signal: PublicCivicSignal;
  lead?: boolean;
}) {
  const { comparison } = signal;
  const denominator =
    comparison.kind === "composition" ? comparison.baseline : null;
  const fill =
    denominator && denominator > 0
      ? Math.min(100, Math.max(0, (comparison.current / denominator) * 100))
      : 0;

  return (
    <article
      className="relative overflow-hidden rounded-[var(--app-radius-xl)] border"
      style={{
        borderColor: lead
          ? "color-mix(in srgb, var(--app-cool) 32%, var(--app-border))"
          : "var(--app-border)",
        background:
          "linear-gradient(152deg, color-mix(in srgb, var(--app-cool) 7%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid) 52%)",
        boxShadow: lead
          ? "0 26px 62px -48px rgba(24, 20, 13, 0.95)"
          : undefined,
      }}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="rounded-full px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]"
            style={{
              color: "var(--app-cool)",
              background:
                "color-mix(in srgb, var(--app-cool) 10%, transparent)",
            }}
          >
            {topicLabel(signal.topic)}
          </span>
          <span
            className="font-mono text-[9.5px] uppercase tracking-[0.1em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {signal.scope.label} · {signal.window.label}
          </span>
        </div>

        <h2
          className={`mt-4 font-serif font-semibold leading-[1.06] tracking-tight ${
            lead ? "text-[27px] sm:text-[30px]" : "text-[23px]"
          }`}
          style={{ color: "var(--app-ink)" }}
        >
          {signal.title}
        </h2>
        <p
          className="mt-2.5 text-[14px] leading-relaxed sm:text-[15px]"
          style={{ color: "var(--app-ink-2)" }}
        >
          {signal.statement}
        </p>

        {comparison.kind === "composition" && denominator !== null && (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <span
                className="font-mono text-[34px] font-semibold leading-none tabular-nums"
                style={{ color: "var(--app-ink)" }}
              >
                {comparison.current}
                <span
                  className="ml-1 text-[15px] font-medium"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  of {denominator}
                </span>
              </span>
              <span
                className="max-w-[48%] text-right text-[10.5px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                {comparison.label}
              </span>
            </div>
            <div
              className="mt-2.5 h-2 overflow-hidden rounded-full"
              style={{
                background:
                  "color-mix(in srgb, var(--app-ink) 8%, transparent)",
              }}
              role="img"
              aria-label={`${comparison.current} of ${denominator}: ${comparison.label}`}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${fill}%`,
                  background:
                    "linear-gradient(90deg, var(--app-cool), color-mix(in srgb, var(--app-cool) 72%, var(--app-brand)))",
                }}
              />
            </div>
          </div>
        )}

        {comparison.kind !== "composition" && (
          <div className="mt-5 flex items-end gap-3">
            <span
              className="font-mono text-[34px] font-semibold leading-none tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              {formatUnit(comparison.current, comparison.unit)}
            </span>
            <span
              className="pb-0.5 text-[11px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              {comparison.label}
            </span>
          </div>
        )}

        <p
          className="mt-4 border-l-2 pl-3 text-[12.5px] leading-relaxed"
          style={{
            borderColor: "var(--app-cool)",
            color: "var(--app-ink-2)",
          }}
        >
          {signal.whyItMatters}
        </p>
      </div>

      <details
        className="group"
        style={{ borderTop: "1px solid var(--app-border)" }}
      >
        <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[12px] font-semibold marker:hidden sm:px-5">
          <span style={{ color: "var(--app-ink)" }}>
            Evidence and calculation
          </span>
          <span
            aria-hidden
            className="text-[15px] transition-transform group-open:rotate-45"
            style={{ color: "var(--app-ink-3)" }}
          >
            +
          </span>
        </summary>

        <div
          className="space-y-4 px-4 pb-4 pt-3 sm:px-5 sm:pb-5"
          style={{ borderTop: "1px solid var(--app-border)" }}
        >
          <div>
            <p
              className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Fixed rule · v{signal.method.version}
            </p>
            <p
              className="mt-1 text-[11.5px] leading-relaxed"
              style={{ color: "var(--app-ink-2)" }}
            >
              {signal.method.summary}
            </p>
          </div>

          <dl
            className="overflow-hidden rounded-[var(--app-radius-md)] border"
            style={{ borderColor: "var(--app-border)" }}
          >
            {signal.evidence.map((item, index) => (
              <div
                key={`${item.factId}-${item.role}`}
                className="flex items-center justify-between gap-4 px-3 py-2.5"
                style={
                  index > 0
                    ? { borderTop: "1px solid var(--app-border)" }
                    : undefined
                }
              >
                <dt
                  className="min-w-0 text-[11.5px] leading-snug"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {item.label}
                </dt>
                <dd
                  className="shrink-0 font-mono text-[12px] font-semibold tabular-nums"
                  style={{ color: "var(--app-ink)" }}
                >
                  {formatUnit(item.value, item.unit)}
                </dd>
              </div>
            ))}
          </dl>

          <ul
            className="space-y-1.5 text-[11px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            {signal.caveats.map((caveat) => (
              <li key={caveat} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{caveat}</span>
              </li>
            ))}
          </ul>

          {signal.evidence[0] && (
            <a
              href={signal.evidence[0].source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-44-y inline-flex items-center gap-1 text-[11px] font-semibold underline decoration-1 underline-offset-2"
              style={{ color: "var(--app-ink-2)" }}
            >
              {signal.evidence[0].source.label}
              <ExternalLink
                className="h-3 w-3"
                strokeWidth={2}
                aria-hidden
              />
            </a>
          )}

          {signal.actions.map((action) => (
            <Action key={`${action.href}-${action.label}`} {...action} />
          ))}
        </div>
      </details>
    </article>
  );
}
