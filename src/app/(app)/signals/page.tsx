import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import CivicSignalCard from "@/components/signals/CivicSignalCard";
import SourceReadiness from "@/components/signals/SourceReadiness";
import PageBloom from "@/components/ui/PageBloom";
import { loadCivicSignals } from "@/lib/civic-signals";
import type { PublicCivicSourceHealth } from "@/lib/civic-signals";
import { PRODUCT_NAMES } from "@/lib/product-names";

export const metadata: Metadata = {
  alternates: { canonical: "/signals" },
  title: PRODUCT_NAMES.civicSignals.pageTitle,
  description: PRODUCT_NAMES.civicSignals.description,
};

export const revalidate = 3_600;

const HEALTH_META: Record<
  PublicCivicSourceHealth["status"],
  { label: string; color: string }
> = {
  ready: { label: "Current snapshot", color: "var(--app-positive)" },
  stale: { label: "Dated snapshot", color: "var(--app-accent-press)" },
  "review-required": {
    label: "Reuse review pending",
    color: "var(--app-accent-press)",
  },
  insufficient: {
    label: "Not enough data",
    color: "var(--app-accent-press)",
  },
  invalid: { label: "Source check failed", color: "var(--app-brand-press)" },
  unavailable: {
    label: "Source unavailable",
    color: "var(--app-brand-press)",
  },
};

export default async function CivicSignalsPage() {
  const data = await loadCivicSignals();
  const sourceHealth = data.sourceHealth[0];

  return (
    <div className="relative mx-auto max-w-2xl space-y-7 pb-6 pt-1">
      <PageBloom variant="warm-cool" />

      <header className="relative">
        <div className="flex items-center justify-between gap-4">
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Evidence desk
          </p>
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            <ShieldCheck
              className="h-3.5 w-3.5"
              strokeWidth={1.9}
              aria-hidden
            />
            Aggregate data only
          </span>
        </div>
        <h1
          className="mt-2.5 max-w-xl font-serif text-[31px] font-semibold leading-[1.02] tracking-tight sm:text-[39px]"
          style={{ color: "var(--app-ink)" }}
        >
          What Frederick&rsquo;s public data shows.
        </h1>
        <p
          className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed sm:text-[14.5px]"
          style={{ color: "var(--app-ink-2)" }}
        >
          Radius runs fixed checks against official or approved datasets. Every
          published finding keeps its dates, calculation, source, and limits
          attached.
        </p>
        <Link
          href="#source-desk"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            color: "var(--app-ink)",
          }}
        >
          See source status
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </header>

      <section aria-labelledby="published-signals" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2
            id="published-signals"
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            {data.signals.length.toLocaleString()}{" "}
            {data.signals.length === 1 ? "finding" : "findings"} passed the
            release rules
          </h2>
          {sourceHealth && (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{
                  background: HEALTH_META[sourceHealth.status].color,
                }}
              />
              {HEALTH_META[sourceHealth.status].label}
            </span>
          )}
        </div>

        {data.signals.length > 0 ? (
          <div className="space-y-3">
            {data.signals.map((signal, index) => (
              <CivicSignalCard
                key={signal.id}
                signal={signal}
                lead={index === 0}
              />
            ))}
          </div>
        ) : (
          <div
            className="rounded-[var(--app-radius-xl)] border px-4 py-5"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-elevated)",
            }}
          >
            <p
              className="font-serif text-[21px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              {sourceHealth?.status === "review-required"
                ? "The first aggregate is connected, not published."
                : "No finding passed the release rules for this update."}
            </p>
            <p
              className="mt-1.5 text-[12.5px] leading-relaxed"
              style={{ color: "var(--app-ink-2)" }}
            >
              {sourceHealth?.status === "review-required"
                ? "A privacy-safe FixIT aggregate is deployed, but Radius is holding it until the source reuse terms are cleared."
                : "Radius keeps an empty result instead of turning a small, stale, or incomplete sample into a story."}
            </p>
          </div>
        )}

        <p
          className="px-1 text-[11px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          {data.signals.length > 0
            ? "This first release is deliberately narrow. One inspectable finding is more useful than a page of guesses."
            : "The source desk below separates connected sources from those still waiting on review."}
        </p>
      </section>

      <SourceReadiness />

      <section
        aria-labelledby="civic-signal-boundary"
        className="rounded-[var(--app-radius-lg)] border p-4"
        style={{
          borderColor: "var(--app-border)",
          background:
            "linear-gradient(145deg, color-mix(in srgb, var(--app-brand) 5%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid))",
        }}
      >
        <h2
          id="civic-signal-boundary"
          className="font-serif text-[21px] font-semibold leading-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Public safety has a harder line.
        </h2>
        <p
          className="mt-2 text-[12.5px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Radius will not rank neighborhoods, forecast crime, expose exact
          incident locations, or treat a call for service as proof that a crime
          occurred. Sensitive findings require delayed, broad aggregates and
          human review.
        </p>
        <Link
          href="/trust"
          className="tap-44-y mt-2 inline-flex items-center gap-1 text-[11px] font-semibold underline decoration-1 underline-offset-2"
          style={{ color: "var(--app-ink-2)" }}
        >
          How Radius checks data
          <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
        </Link>
      </section>
    </div>
  );
}
