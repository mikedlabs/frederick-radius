"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { readFairPlan, type FairPlan } from "@/lib/fair/plan";
import { buildFairPlanStatus } from "@/lib/fair/plan-status";
import {
  TODAY_FAIR_PROMOTION_HREF,
  type TodayFairPromotionPhase,
} from "@/lib/today/fair-promotion";

const COPY: Record<
  TodayFairPromotionPhase,
  { eyebrow: string; headline: string; detail: string; cta: string }
> = {
  planning: {
    eyebrow: "Great Frederick Fair · Sep 18–26",
    headline: "Your Fair Day planner is ready.",
    detail:
      "Sort out tickets, parking, transit, and what you do not want to miss before you go.",
    cta: "Plan your Fair day",
  },
  "fair-day": {
    eyebrow: "The Great Frederick Fair · Through Sep 26",
    headline: "Make today at the Fair easier.",
    detail:
      "See what is on, find food and rides, and keep tickets, parking, transit, and your plan together.",
    cta: "Open Fair Day",
  },
};

export default function TodayFairFeature({
  phase,
}: {
  phase: TodayFairPromotionPhase;
}) {
  const copy = COPY[phase];
  const [savedPlan, setSavedPlan] = useState<FairPlan | null>(null);

  useEffect(() => {
    const refreshPlan = () => setSavedPlan(readFairPlan(window.localStorage));
    refreshPlan();
    window.addEventListener("storage", refreshPlan);
    window.addEventListener("pageshow", refreshPlan);
    return () => {
      window.removeEventListener("storage", refreshPlan);
      window.removeEventListener("pageshow", refreshPlan);
    };
  }, []);

  const status = savedPlan ? buildFairPlanStatus(savedPlan) : null;
  const headline = status
    ? status.savedStopCount > 0
      ? "Your Fair day is taking shape."
      : status.handledPreparationCount > 0 ||
          savedPlan?.arrivalChoice !== "undecided"
        ? "Keep your Fair plan moving."
        : copy.headline
    : copy.headline;
  const detail = status?.summarySentence ?? copy.detail;
  const cta = status?.nextActionLabel ?? copy.cta;
  const href = status?.nextActionHref ?? TODAY_FAIR_PROMOTION_HREF;

  return (
    <section aria-label="The Great Frederick Fair">
      <Link
        href={href}
        prefetch={false}
        data-today-fair-feature={phase}
        data-today-fair-plan={status ? "saved" : "new"}
        className="group relative isolate block min-h-[188px] overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bedrock)] text-[var(--app-ink-inverse)] shadow-[var(--app-elev-1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] sm:min-h-[220px]"
      >
        <picture className="absolute inset-0 block">
          <source
            media="(min-width: 640px)"
            srcSet="/images/fair/fairgrounds-night-mike-d-1920.jpg"
          />
          <img
            src="/images/fair/fairgrounds-night-mike-d-960.jpg"
            alt=""
            width="960"
            height="540"
            loading="eager"
            fetchPriority="high"
            className="h-full w-full object-cover object-[76%_center] sm:object-center"
          />
        </picture>

        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--app-bedrock) 94%, transparent) 0%, color-mix(in srgb, var(--app-bedrock) 76%, transparent) 48%, color-mix(in srgb, var(--app-bedrock) 12%, transparent) 100%), linear-gradient(to top, color-mix(in srgb, var(--app-bedrock) 86%, transparent) 0%, transparent 68%)",
          }}
        />

        <div className="relative z-10 flex min-h-[188px] flex-col justify-between p-4 sm:min-h-[220px] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-[75%] text-[10px] font-bold uppercase leading-tight tracking-[0.14em] sm:text-[11px]">
              {copy.eyebrow}
            </p>
            <span className="shrink-0 text-[10px] font-medium leading-none opacity-80 sm:text-[10.5px]">
              Photo: Mike D
            </span>
          </div>

          <div className="max-w-[19rem] sm:max-w-[31rem]">
            <p className="text-[27px] font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-[34px]">
              {headline}
            </p>
            <p className="mt-2 max-w-[28rem] text-[12.5px] font-medium leading-[1.35] sm:text-[14px]">
              {detail}
            </p>
            <span className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold sm:text-[13px]">
              {cta}
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
                strokeWidth={2.5}
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}
