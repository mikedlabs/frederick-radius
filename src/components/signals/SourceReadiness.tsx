import { ExternalLink } from "lucide-react";
import {
  CIVIC_SOURCE_READINESS,
  CIVIC_SOURCE_STAGE_ORDER,
  type CivicSourceStage,
} from "@/lib/civic-signals/sources";

const STAGE_COPY: Record<
  CivicSourceStage,
  { label: string; short: string; color: string }
> = {
  publishing: {
    label: "Publishing",
    short: "live",
    color: "var(--app-positive)",
  },
  connected_pending: {
    label: "Connected, publication held",
    short: "pending",
    color: "var(--app-accent-press)",
  },
  ready_to_join: {
    label: "Ready to join",
    short: "next",
    color: "var(--app-cool)",
  },
  source_found: {
    label: "Source found",
    short: "reviewing",
    color: "var(--app-accent-press)",
  },
  review_required: {
    label: "Permission or safety review",
    short: "held",
    color: "var(--app-brand-press)",
  },
};

export default function SourceReadiness() {
  const populatedStages = CIVIC_SOURCE_STAGE_ORDER.filter((stage) =>
    CIVIC_SOURCE_READINESS.some((source) => source.stage === stage),
  );

  return (
    <section aria-labelledby="signal-source-desk" className="space-y-3">
      <header>
        <p
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Source desk
        </p>
        <h2
          id="signal-source-desk"
          className="mt-1 font-serif text-[24px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          What Radius can use, and what it is holding back.
        </h2>
      </header>

      <div
        className="overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "0 18px 40px -38px rgba(24, 20, 13, 0.7)",
        }}
      >
        {populatedStages.map((stage, stageIndex) => {
          const sources = CIVIC_SOURCE_READINESS.filter(
            (source) => source.stage === stage,
          );
          if (sources.length === 0) return null;
          const meta = STAGE_COPY[stage];

          return (
            <details
              key={stage}
              open={stage === "publishing" || stage === "connected_pending"}
              className="group"
              style={
                stageIndex > 0
                  ? { borderTop: "1px solid var(--app-border)" }
                  : undefined
              }
            >
              <summary className="tap-44 flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 marker:hidden">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: meta.color,
                    boxShadow: `0 0 0 4px color-mix(in srgb, ${meta.color} 12%, transparent)`,
                  }}
                />
                <span
                  className="min-w-0 flex-1 text-[13px] font-semibold"
                  style={{ color: "var(--app-ink)" }}
                >
                  {meta.label}
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.12em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {sources.length} {meta.short}
                </span>
                <span
                  aria-hidden
                  className="text-[14px] transition-transform group-open:rotate-45"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  +
                </span>
              </summary>

              <div style={{ borderTop: "1px solid var(--app-border)" }}>
                {sources.map((source, sourceIndex) => (
                  <article
                    key={source.id}
                    className="px-3.5 py-3.5"
                    style={
                      sourceIndex > 0
                        ? { borderTop: "1px solid var(--app-border)" }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="text-[14px] font-semibold leading-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {source.name}
                        </p>
                        <p
                          className="mt-0.5 text-[10.5px] leading-snug"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {source.owner} · {source.topic}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]"
                        style={{
                          borderColor: `color-mix(in srgb, ${meta.color} 28%, var(--app-border))`,
                          background: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
                          color: meta.color,
                        }}
                      >
                        {source.statusLabel}
                      </span>
                    </div>
                    <p
                      className="mt-2 text-[12.5px] leading-relaxed"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      {source.summary}
                    </p>
                    {source.caution && (
                      <p
                        className="mt-1.5 text-[11px] leading-relaxed"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {source.caution}
                      </p>
                    )}
                    <a
                      href={source.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-44-y mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold underline decoration-1 underline-offset-2"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      Open the official source
                      <ExternalLink
                        className="h-3 w-3"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </a>
                  </article>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
