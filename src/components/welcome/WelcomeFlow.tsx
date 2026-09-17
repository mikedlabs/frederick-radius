"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Coffee,
  Trees,
  Baby,
  ArrowRight,
  ArrowLeft,
  Home,
  Compass,
  Store,
  Check,
} from "lucide-react";
import { useMode, type Mode } from "@/hooks/useMode";
import { setInterests } from "@/lib/personalize";
import { haptic } from "@/lib/haptics";
import { BRAND } from "@/lib/brand";

/**
 * WelcomeFlow — the first-run onboarding funnel, cut to two steps.
 *
 * Was three steps (persona → home muni → 8 interest tiles) which felt
 * like a settings panel disguised as onboarding. Per the architecture
 * review: two questions, three taps total, and the user is in. Anything
 * deeper (home municipality, more interests) is reachable later from
 * /settings or by using the app.
 *
 * The two questions:
 *   1. In the mood for? — 3 mood tiles (Coffee · Outdoors · Family).
 *      Sets ONE initial interest so /today's MoodTiles and curated rails
 *      have a starting bias.
 *   2. Live here? — yes/no. Sets the Mode (resident vs visitor) which
 *      every other surface reads to pick defaults.
 *
 * Both steps are skippable. A skip writes the fr_onboarded cookie so
 * middleware won't bounce the user back here on the next visit;
 * skipped picks leave the defaults in place.
 *
 * Business owners get their own door at the foot of step 1 — they
 * aren't a third persona chip; this flow is for visitor/resident.
 */

// One-year cookie. Middleware reads it to decide whether a visitor
// still needs the welcome screen. Not a security boundary, just a
// "have they been here" marker.
function markOnboarded(): void {
  document.cookie = "fr_onboarded=1; path=/; max-age=31536000; samesite=lax";
}

type Step = 1 | 2;

// The three moods replace the previous 8-tile interest grid. They map
// to top-level category slugs already used app-wide so a mood pick
// here seeds /today's MoodTiles bias + the SkyHero personalization.
const MOOD_TILES: Array<{
  /** Maps to a top-level category slug stored in personalize state. */
  slug: string;
  label: string;
  /** Short caption shown under the label — sets the tone. */
  caption: string;
  Icon: typeof Coffee;
  color: string;
}> = [
  { slug: "food", label: "Eat & drink", caption: "Coffee, brewery, dinner",  Icon: Coffee, color: BRAND.colors.brick },
  { slug: "outdoors", label: "Outdoors", caption: "Parks, trails, water",     Icon: Trees,  color: "#315A43" },
  { slug: "family",   label: "With kids", caption: "Family-friendly spots",   Icon: Baby,   color: BRAND.colors.ridge },
];

export default function WelcomeFlow() {
  const { setMode } = useMode();
  const [step, setStep] = useState<Step>(1);
  const [chosenMood, setChosenMood] = useState<string | null>(null);

  // Hard navigation, not router.replace — middleware reads the cookie
  // on every request, and a client-side router push can race
  // document.cookie on some Safari/cache states.
  function goToNow(): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/today");
  }

  const finish = useCallback(
    (mode: Mode | null) => {
      haptic("success");
      if (chosenMood) setInterests([chosenMood]);
      if (mode) setMode(mode);
      markOnboarded();
      goToNow();
    },
    [chosenMood, setMode],
  );

  const skip = useCallback(() => {
    haptic("light");
    if (chosenMood) setInterests([chosenMood]);
    markOnboarded();
    goToNow();
  }, [chosenMood]);

  const chooseMood = useCallback((slug: string) => {
    haptic("medium");
    setChosenMood(slug);
    setStep(2);
  }, []);

  return (
    <main
      className="mx-auto flex min-h-[100svh] max-w-screen-sm flex-col justify-center px-6 py-12"
      style={{ color: "var(--app-ink)" }}
    >
      {/* Pacing dots. Two ticks total — readable as "two short
          questions" rather than "another form to grind through." */}
      <div className="mb-8 flex items-center gap-2" aria-hidden>
        <StepDot active={step === 1} done={step > 1} />
        <StepDot active={step === 2} done={false} />
      </div>

      <header className="mb-7">
        <p
          className="eyebrow"
          style={{ color: "var(--app-ink-3)" }}
        >
          {step === 1 ? "Quick start · 1 of 2" : "Quick start · 2 of 2"}
        </p>
        <h1
          className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {step === 1
            ? "What are you in the mood for?"
            : "Do you live in Frederick County?"}
        </h1>
        <p
          className="mt-1.5 text-[13px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {step === 1
            ? "Choose one to personalize your home page. You can change it later."
            : "Your answer only changes how Radius phrases recommendations, and it stays on this device."}
        </p>
      </header>

      {step === 1 && (
        <ul className="space-y-2.5" aria-label="Pick a mood">
          {MOOD_TILES.map((m) => {
            const Icon = m.Icon;
            const isChosen = chosenMood === m.slug;
            return (
              <li key={m.slug}>
                <button
                  type="button"
                  onClick={() => chooseMood(m.slug)}
                  className="tactile tactile-interactive flex w-full items-center gap-3.5 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] px-4 py-4 text-left transition active:scale-[0.99]"
                  style={{
                    borderColor: isChosen ? m.color : "var(--app-border)",
                    boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                  }}
                >
                  <span
                    aria-hidden
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                    style={{ background: `color-mix(in srgb, ${m.color} 14%, transparent)` }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} style={{ color: m.color }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-[16px] font-semibold leading-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {m.label}
                    </span>
                    <span
                      className="block text-[13px]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {m.caption}
                    </span>
                  </span>
                  {isChosen ? (
                    <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} style={{ color: m.color }} aria-hidden />
                  ) : (
                    <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {step === 2 && (
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => finish("resident")}
            className="tactile tactile-interactive flex w-full items-center gap-3.5 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] px-4 py-4 text-left transition active:scale-[0.99]"
            style={{
              borderColor: "var(--app-border)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)" }}
            >
              <Home className="h-5 w-5" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[16px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Yes, I live here
              </span>
              <span className="block text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                Uses familiar local names with less explanation.
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => finish("visitor")}
            className="tactile tactile-interactive flex w-full items-center gap-3.5 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] px-4 py-4 text-left transition active:scale-[0.99]"
            style={{
              borderColor: "var(--app-border)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)" }}
            >
              <Compass className="h-5 w-5" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[16px] font-semibold leading-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Just visiting
              </span>
              <span className="block text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                Adds more context to help you get oriented.
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </button>
        </div>
      )}

      {/* Footer affordances. Skip leaves with whatever's been picked
          so far; Back returns to step 1 from step 2. The business-
          owner door sits only on step 1 — they're not the audience
          for the mood/persona pick. */}
      <div className="mt-8 flex items-center justify-between gap-3">
        {step === 2 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="inline-flex items-center gap-1 text-[12px] font-semibold"
            style={{ color: "var(--app-ink-3)" }}
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            Back
          </button>
        ) : (
          <span aria-hidden />
        )}
        <button
          type="button"
          onClick={skip}
          className="text-[12px] font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          {step === 1 ? "Skip" : "Skip the rest"}
        </button>
      </div>

      {step === 1 && (
        <div
          className="mt-12 border-t pt-6 text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          <p className="inline-flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Own a business in Frederick County?{" "}
            <Link
              href="/submit/place"
              className="font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--app-brand)" }}
            >
              Claim or add your listing <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      className="block h-1.5 rounded-full transition-all"
      style={{
        width: active ? 24 : 8,
        background: done
          ? "var(--app-brand)"
          : active
            ? "var(--app-brand)"
            : "var(--app-border)",
      }}
    />
  );
}
