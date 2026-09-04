"use client";

import Link from "next/link";
import { ArrowRight, FerrisWheel } from "lucide-react";
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
    headline: "Plan the Fair in one place.",
    detail:
      "Use the official program and searchable Fairgrounds map, compare ticket and arrival options, then save a day plan on your phone.",
    cta: "Plan your Fair day",
  },
  "fair-day": {
    eyebrow: "The Great Frederick Fair · Through Sep 26",
    headline: "Your Fair day, in one place.",
    detail:
      "See what is happening, find places on the grounds, and keep your plan close while you are there.",
    cta: "Open Radius at the Fair",
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
    const refreshPlan = () => {
      try {
        setSavedPlan(readFairPlan(window.localStorage));
      } catch {
        // Some privacy modes throw while the storage property itself is read,
        // before readFairPlan can guard its getItem call.
        setSavedPlan(null);
      }
    };
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
        data-fair-feature-tone="light"
        className="group relative isolate block min-h-[168px] overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)] text-[var(--app-ink)] shadow-[var(--app-elev-2)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] sm:min-h-[196px]"
        style={{ borderColor: "var(--app-border-strong)" }}
      >
        <picture className="absolute inset-0 block">
          <source
            type="image/webp"
            srcSet="/images/fair/fairgrounds-night-mike-d-480.webp 480w, /images/fair/fairgrounds-night-mike-d-960.webp 960w, /images/fair/fairgrounds-night-mike-d-1920.webp 1920w"
            sizes="(min-width: 1024px) 68rem, 100vw"
          />
          <img
            src="/images/fair/fairgrounds-night-mike-d-960.jpg"
            srcSet="/images/fair/fairgrounds-night-mike-d-960.jpg 960w, /images/fair/fairgrounds-night-mike-d-1920.jpg 1920w"
            sizes="(min-width: 1024px) 68rem, 100vw"
            alt=""
            width="960"
            height="540"
            loading="eager"
            fetchPriority="high"
            className="h-full w-full object-cover object-[78%_center] saturate-[1.22] brightness-[1.08] sm:object-center"
          />
        </picture>

        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, var(--app-bg-elevated-solid) 0%, color-mix(in srgb, var(--app-bg-elevated-solid) 98%, transparent) 50%, color-mix(in srgb, var(--app-bg-elevated-solid) 84%, transparent) 69%, color-mix(in srgb, var(--app-bg-elevated-solid) 12%, transparent) 100%), linear-gradient(to top, color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent) 0%, transparent 66%)",
          }}
        />

        <span
          data-fair-feature-art
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1"
          style={{
            background:
              "linear-gradient(90deg, var(--app-brand) 0 24%, var(--app-amber) 24% 41%, var(--app-brand-2) 41% 59%, var(--app-cool) 59% 78%, var(--app-accent) 78% 100%)",
          }}
        />

        <div className="relative z-10 flex min-h-[168px] flex-col justify-between p-4 pt-5 sm:min-h-[196px] sm:p-5 sm:pt-6">
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-2.5">
              <span
                data-fair-feature-icon
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-md)] text-[var(--app-ink-inverse)] shadow-[var(--app-elev-1)] sm:h-10 sm:w-10"
                style={{
                  background:
                    "linear-gradient(135deg, var(--app-cool) 0 52%, var(--app-brand) 52% 100%)",
                }}
                aria-hidden="true"
              >
                <FerrisWheel className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.14em] sm:text-[11px]">
                {copy.eyebrow}
              </p>
            </div>
          </div>

          <div className="max-w-[17.5rem] sm:max-w-[31rem]">
            <p className="text-[24px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[31px]">
              {headline}
            </p>
            <p className="mt-2 hidden max-w-[27rem] text-[15px] font-medium leading-[1.45] sm:block">
              {detail}
            </p>
            <span className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--app-brand)] px-3.5 text-[12.5px] font-bold text-[var(--app-on-brand)] shadow-[var(--app-elev-1)] sm:mt-3 sm:min-h-10 sm:px-4 sm:text-[13.5px]">
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
