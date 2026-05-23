"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass, Home, Store, ArrowRight } from "lucide-react";
import { useMode, type Mode } from "@/hooks/useMode";
import { haptic } from "@/lib/haptics";

/**
 * WelcomeFlow: the first-run entry screen.
 *
 * Shown once. Picking a persona seeds the Visitor/Resident mode the rest
 * of the app already reads (via useMode), then sets the `fr_onboarded`
 * cookie so middleware skips this screen on every later visit. Skip
 * leaves the mode to the geolocation nudge / default. Business owners
 * get their own door, not a third persona chip.
 */

// One-year cookie. Middleware reads it on / and /today to decide whether
// a visitor still needs the welcome screen. Not a security boundary,
// just a "have they been here" marker, so a client-set cookie is fine.
function markOnboarded(): void {
  document.cookie = "fr_onboarded=1; path=/; max-age=31536000; samesite=lax";
}

export default function WelcomeFlow() {
  const router = useRouter();
  const { setMode } = useMode();

  function choose(mode: Mode): void {
    haptic("medium");
    setMode(mode);
    markOnboarded();
    router.replace("/today");
  }

  function skip(): void {
    haptic("light");
    markOnboarded();
    router.replace("/today");
  }

  return (
    <main
      className="mx-auto flex min-h-[100svh] max-w-screen-sm flex-col justify-center px-6 py-12"
      style={{ color: "var(--app-ink)" }}
    >
      <header className="space-y-2">
        <p
          className="text-[13px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--app-cool)" }}
        >
          Frederick Radius
        </p>
        <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-tight">
          What brings you to Frederick?
        </h1>
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Pick one so we can tune the map and what&apos;s on. You can change it
          any time.
        </p>
      </header>

      <div className="mt-7 space-y-3">
        <PersonaCard
          icon={<Compass className="h-6 w-6" strokeWidth={2} aria-hidden />}
          accent="var(--app-cool)"
          title="I'm visiting"
          blurb="Food, arts, and where to park. The best of downtown this weekend."
          onClick={() => choose("visitor")}
        />
        <PersonaCard
          icon={<Home className="h-6 w-6" strokeWidth={2} aria-hidden />}
          accent="var(--app-brand)"
          title="I live here"
          blurb="What's open, what's closed, and civic happenings across the county."
          onClick={() => choose("resident")}
        />
      </div>

      <button
        type="button"
        onClick={skip}
        className="mt-5 self-center text-[13px] font-medium underline underline-offset-4"
        style={{ color: "var(--app-ink-3)" }}
      >
        Skip for now
      </button>

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
    </main>
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
