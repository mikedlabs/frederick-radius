import { ArrowRight } from "lucide-react";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";
import type { Answer, AnswerStatus } from "@/lib/answers/types";

/**
 * AnswerCard — the product's core primitive (UX_REDO Build 0).
 *
 * One consistent answer unit: status chip, the answer, why it's shown,
 * source + freshness, optional distance/time, and one or two actions.
 * Server-component safe (built on Surface + Button + tokens). This is
 * the visual language for Today, and Search / Map / Events / Place next.
 */

const STATUS_META: Record<AnswerStatus, { label: string; fg: string; bg: string }> = {
  "open-now": { label: "Open now", fg: "var(--app-positive)", bg: "color-mix(in srgb, var(--app-positive) 18%, transparent)" },
  tonight: { label: "Tonight", fg: "var(--app-accent)", bg: "color-mix(in srgb, var(--app-accent) 20%, transparent)" },
  weekend: { label: "Weekend", fg: "var(--app-cool)", bg: "color-mix(in srgb, var(--app-cool) 20%, transparent)" },
  transit: { label: "Transit", fg: "var(--app-cool)", bg: "color-mix(in srgb, var(--app-cool) 18%, transparent)" },
  parking: { label: "Parking", fg: "var(--app-ink-2)", bg: "color-mix(in srgb, var(--app-ink) 12%, transparent)" },
  civic: { label: "Civic", fg: "var(--app-cool)", bg: "color-mix(in srgb, var(--app-cool) 18%, transparent)" },
  events: { label: "Events", fg: "var(--app-accent)", bg: "color-mix(in srgb, var(--app-accent) 18%, transparent)" },
  free: { label: "Free", fg: "var(--app-positive)", bg: "color-mix(in srgb, var(--app-positive) 18%, transparent)" },
};

export default function AnswerCard({ answer }: { answer: Answer }) {
  const meta = answer.status ? STATUS_META[answer.status] : null;
  const statusLabel = answer.statusLabel ?? meta?.label;
  const metaRight = answer.distanceLabel ?? answer.timeLabel;
  const source = [answer.sourceLabel, answer.freshnessLabel].filter(Boolean).join(" · ");

  return (
    <Surface
      as="article"
      elevation={2}
      className="relative flex h-full flex-col gap-2 overflow-hidden p-4 pl-[19px]"
    >
      {/* Color-coded spine keyed to the answer's status — turns a wall of
          identical cream cards into an at-a-glance, differentiated stack. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: meta?.fg ?? "var(--app-cool)" }}
      />
      {(statusLabel || metaRight) && (
        <div className="flex items-center justify-between gap-2">
          {statusLabel ? (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]"
              style={{
                background: meta?.bg,
                color: meta?.fg ?? "var(--app-ink-2)",
                boxShadow: meta ? `inset 0 0 0 1px color-mix(in srgb, ${meta.fg} 30%, transparent)` : undefined,
              }}
            >
              {statusLabel}
            </span>
          ) : (
            <span />
          )}
          {metaRight && (
            <span className="text-[12px] font-medium tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {metaRight}
            </span>
          )}
        </div>
      )}

      <div className="space-y-1">
        <h3
          className="text-[16px] font-semibold leading-snug"
          style={{ color: "var(--app-ink)", fontFamily: "var(--font-display, Georgia, serif)" }}
        >
          {answer.title}
        </h3>
        {answer.answer && (
          <p className="text-[13.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {answer.answer}
          </p>
        )}
      </div>

      {(answer.whyShown || source) && (
        <div className="mt-auto space-y-0.5 pt-1">
          {answer.whyShown && (
            <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              {answer.whyShown}
            </p>
          )}
          {source && (
            <p className="text-[10.5px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
              {source}
            </p>
          )}
        </div>
      )}

      {(answer.primaryAction || answer.secondaryAction) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {answer.primaryAction && (
            <Button
              variant="primary"
              size="sm"
              href={answer.primaryAction.href}
              iconRight={<ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
            >
              {answer.primaryAction.label}
            </Button>
          )}
          {answer.secondaryAction && (
            <Button variant="ghost" size="sm" href={answer.secondaryAction.href}>
              {answer.secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </Surface>
  );
}
