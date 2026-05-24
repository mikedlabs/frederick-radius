"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Compass,
  Home,
  Store,
  ArrowRight,
  ArrowLeft,
  MapPin,
  Utensils,
  Trees,
  Palette,
  Baby,
  Activity,
  ShoppingBag,
  Heart,
  Hotel,
  Check,
} from "lucide-react";
import { useMode, type Mode } from "@/hooks/useMode";
import { MUNICIPALITIES } from "@/data/municipalities";
import { setHomeMuni, setInterests } from "@/lib/personalize";
import { haptic } from "@/lib/haptics";

/**
 * WelcomeFlow — the first-run onboarding funnel.
 *
 * Three steps, each skippable, each gracefully no-ops a missing pick:
 *
 *   1. Persona   → seeds Visitor / Resident mode (used app-wide by the
 *                  useMode hook to pick default layers + scoping).
 *   2. Where     → optional home municipality. Seeds the map default
 *                  center and Radius starting point. "All of the
 *                  county" leaves it null.
 *   3. Interests → optional top-level category slugs. Soft defaults
 *                  for Today's curated rails and Radius filter chips.
 *
 * Everything is a soft bias — these picks never hide content. They
 * just change what bubbles up by default. Skip on any step writes the
 * `fr_onboarded` cookie and goes straight to /today; middleware
 * doesn't redirect again on later visits.
 *
 * Business owners get their own door at the foot of step 1 — they
 * aren't a third persona chip, the flow is for the visitor/resident
 * audience.
 */

// One-year cookie. Middleware reads it on / and /today to decide
// whether a visitor still needs the welcome screen. Not a security
// boundary, just a "have they been here" marker.
function markOnboarded(): void {
  document.cookie = "fr_onboarded=1; path=/; max-age=31536000; samesite=lax";
}

type Step = 1 | 2 | 3;

// The 8 top-level umbrella categories that read as user "interests."
// Service-utility umbrellas (transit, parking, amenities, civic,
// services) are deliberately excluded — nobody picks "transit" as an
// interest. The icons mirror the lucide names in src/data/categories.
const INTEREST_OPTIONS: Array<{ slug: string; label: string; Icon: typeof Utensils; color: string }> = [
  { slug: "food", label: "Food & Drink", Icon: Utensils, color: "#C4451C" },
  { slug: "outdoors", label: "Parks & Trails", Icon: Trees, color: "#1E6B3A" },
  { slug: "arts", label: "Arts & Culture", Icon: Palette, color: "#7E2C6F" },
  { slug: "family", label: "Family", Icon: Baby, color: "#D9A441" },
  { slug: "sports", label: "Sports", Icon: Activity, color: "#0F8A5F" },
  { slug: "shopping", label: "Shopping", Icon: ShoppingBag, color: "#B26B00" },
  { slug: "wellness", label: "Wellness", Icon: Heart, color: "#A02929" },
  { slug: "lodging", label: "Lodging", Icon: Hotel, color: "#5B1E55" },
];

export default function WelcomeFlow() {
  const router = useRouter();
  const { setMode } = useMode();

  const [step, setStep] = useState<Step>(1);
  const [chosenMuni, setChosenMuni] = useState<string | null>(null);
  const [chosenInterests, setChosenInterests] = useState<Set<string>>(new Set());

  const finish = useCallback(() => {
    haptic("success");
    setHomeMuni(chosenMuni);
    setInterests([...chosenInterests]);
    markOnboarded();
    router.replace("/today");
  }, [chosenMuni, chosenInterests, router]);

  const skip = useCallback(() => {
    haptic("light");
    // Skipping commits whatever's already been chosen — picking a
    // persona in step 1 then bailing in step 2 still saves the mode.
    setHomeMuni(chosenMuni);
    setInterests([...chosenInterests]);
    markOnboarded();
    router.replace("/today");
  }, [chosenMuni, chosenInterests, router]);

  const choosePersona = useCallback(
    (mode: Mode) => {
      haptic("medium");
      setMode(mode);
      setStep(2);
    },
    [setMode],
  );

  const chooseMuni = useCallback((slug: string | null) => {
    haptic("light");
    setChosenMuni(slug);
    setStep(3);
  }, []);

  const toggleInterest = useCallback((slug: string) => {
    haptic("light");
    setChosenInterests((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  return (
    <main
      className="mx-auto flex min-h-[100svh] max-w-screen-sm flex-col justify-center px-6 py-12"
      style={{ color: "var(--app-ink)" }}
    >
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <p
            className="text-[13px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--app-cool)" }}
          >
            Frederick Radius
          </p>
          <StepDots step={step} />
        </div>

        {step === 1 && (
          <>
            {/* Value-prop line, deliberately placed BEFORE the persona
                question so a stranger landing here understands what the
                app is in their first three seconds, not after they've
                guessed at a setup form. The H1 question that follows
                only makes sense once they know what they're tuning. */}
            <p
              className="font-serif text-[18px] leading-snug"
              style={{ color: "var(--app-ink-2)" }}
            >
              Find what&apos;s open, what&apos;s happening, and what&apos;s worth your
              time in Frederick County.
            </p>
            <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-tight pt-1">
              What brings you to Frederick?
            </h1>
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Pick one so we can tune the map and what&apos;s on. You can change
              it any time.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-tight">
              Where in the county?
            </h1>
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              We&apos;ll center the map and the &ldquo;near you&rdquo; picks on the place you
              call home. Pick &ldquo;All of the county&rdquo; if you&apos;d rather see
              everything.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-tight">
              What are you into?
            </h1>
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Pick a few. We&apos;ll bias the Today page toward what you care
              about. Tap any to toggle.
            </p>
          </>
        )}
      </header>

      {/* Step content */}
      {step === 1 && (
        <div className="mt-7 space-y-3">
          <PersonaCard
            icon={<Compass className="h-6 w-6" strokeWidth={2} aria-hidden />}
            accent="var(--app-cool)"
            title="I'm visiting"
            blurb="Food, arts, and where to park. The best of downtown this weekend."
            onClick={() => choosePersona("visitor")}
          />
          <PersonaCard
            icon={<Home className="h-6 w-6" strokeWidth={2} aria-hidden />}
            accent="var(--app-brand)"
            title="I live here"
            blurb="What's open, what's closed, and civic happenings across the county."
            onClick={() => choosePersona("resident")}
          />
        </div>
      )}

      {step === 2 && (
        <div className="mt-7 space-y-3">
          <button
            type="button"
            onClick={() => chooseMuni(null)}
            className="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition active:scale-[0.99]"
            style={{
              borderColor:
                chosenMuni === null
                  ? "var(--app-brand)"
                  : "var(--app-border)",
              background: "var(--app-bg-elevated)",
              boxShadow: "var(--app-shadow-1)",
            }}
          >
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
              style={{
                background:
                  "color-mix(in srgb, var(--app-brand) 14%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <MapPin className="h-6 w-6" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold">
                All of the county
              </span>
              <span
                className="mt-0.5 block text-[13px] leading-snug"
                style={{ color: "var(--app-ink-2)" }}
              >
                The default. No anchor, show me everything across the
                13 municipalities.
              </span>
            </span>
            <ArrowRight
              className="h-4 w-4 shrink-0"
              strokeWidth={2.5}
              aria-hidden
              style={{ color: "var(--app-ink-3)" }}
            />
          </button>

          <p
            className="pt-2 text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            …or pick your town
          </p>

          <ul className="grid grid-cols-2 gap-2" aria-label="Municipality picker">
            {MUNICIPALITIES.map((m) => (
              <li key={m.slug}>
                <button
                  type="button"
                  onClick={() => chooseMuni(m.slug)}
                  className="w-full rounded-xl border p-3 text-left text-[14px] font-medium transition active:scale-[0.99]"
                  style={{
                    borderColor:
                      chosenMuni === m.slug
                        ? "var(--app-brand)"
                        : "var(--app-border)",
                    background: "var(--app-bg-elevated)",
                    color: "var(--app-ink)",
                  }}
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 3 && (
        <>
          <ul
            className="mt-7 grid grid-cols-2 gap-2.5"
            aria-label="Interest picker"
          >
            {INTEREST_OPTIONS.map((opt) => {
              const on = chosenInterests.has(opt.slug);
              return (
                <li key={opt.slug}>
                  <button
                    type="button"
                    onClick={() => toggleInterest(opt.slug)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99]"
                    style={{
                      borderColor: on ? opt.color : "var(--app-border)",
                      background: on
                        ? `color-mix(in srgb, ${opt.color} 8%, var(--app-bg-elevated))`
                        : "var(--app-bg-elevated)",
                    }}
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                      style={{
                        background: `color-mix(in srgb, ${opt.color} 16%, transparent)`,
                        color: opt.color,
                      }}
                    >
                      <opt.Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-[14px] font-semibold">
                      {opt.label}
                    </span>
                    {on && (
                      <Check
                        className="h-4 w-4 shrink-0"
                        strokeWidth={3}
                        aria-hidden
                        style={{ color: opt.color }}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={finish}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[15px] font-semibold transition active:scale-[0.99]"
            style={{ background: "var(--app-brand)", color: "white" }}
          >
            {chosenInterests.size === 0 ? "Done" : `Done · ${chosenInterests.size} picked`}
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>
        </>
      )}

      {/* Footer affordances — Back (steps 2+3) and Skip (always). */}
      <div className="mt-5 flex items-center justify-between">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setStep((s) => (s === 3 ? 2 : 1) as Step);
            }}
            className="inline-flex items-center gap-1 text-[13px] font-medium"
            style={{ color: "var(--app-ink-3)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Back
          </button>
        ) : (
          <span aria-hidden />
        )}
        <button
          type="button"
          onClick={skip}
          className="text-[13px] font-medium underline underline-offset-4"
          style={{ color: "var(--app-ink-3)" }}
        >
          {step === 3 ? "Skip the rest" : "Skip for now"}
        </button>
      </div>

      {/* Business owner door — only shows on step 1, that's where it
          fits the "what brings you here" framing. Hidden after that
          since users have committed to the visitor/resident flow. */}
      {step === 1 && (
        <div
          className="mt-8 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
          }}
        >
          <span
            className="inline-flex items-center gap-2 text-[13px]"
            style={{ color: "var(--app-ink-2)" }}
          >
            <Store
              className="h-4 w-4"
              strokeWidth={2}
              aria-hidden
              style={{ color: "var(--app-ink-3)" }}
            />
            Own a local business?
          </span>
          <Link
            href="/business/claim"
            onClick={() => haptic("light")}
            className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold"
            style={{ color: "var(--app-cool)" }}
          >
            Claim your listing
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>
      )}
    </main>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden
          className="h-1.5 rounded-full transition-all"
          style={{
            width: n === step ? "18px" : "6px",
            background:
              n === step
                ? "var(--app-brand)"
                : n < step
                  ? "var(--app-cool)"
                  : "var(--app-border)",
          }}
        />
      ))}
    </span>
  );
}

function PersonaCard({
  icon,
  accent,
  title,
  blurb,
  onClick,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition active:scale-[0.99]"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-shadow-1)",
      }}
    >
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
        style={{
          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
          color: accent,
        }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block text-[16px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </span>
        <span
          className="mt-0.5 block text-[13px] leading-snug"
          style={{ color: "var(--app-ink-2)" }}
        >
          {blurb}
        </span>
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0"
        strokeWidth={2.5}
        aria-hidden
        style={{ color: "var(--app-ink-3)" }}
      />
    </button>
  );
}
