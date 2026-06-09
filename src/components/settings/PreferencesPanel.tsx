"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Compass,
  Home,
  MapPin,
  Sparkles,
  Bell,
  RotateCcw,
  ChevronRight,
  Check,
  Utensils,
  Trees,
  Palette,
  Baby,
  Activity,
  ShoppingBag,
  Heart,
  Hotel,
} from "lucide-react";
import { useMode, resetModeState, type Mode } from "@/hooks/useMode";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import {
  getHomeMuni,
  setHomeMuni,
  getInterests,
  setInterests,
} from "@/lib/personalize";
import { haptic } from "@/lib/haptics";

/**
 * PreferencesPanel — the editable settings hub.
 *
 * Surfaces every device-local pick the user made (Persona, Where,
 * Interests, Notifications topic) in one place so they can see what's
 * been saved and change anything. The chips on Today + the pre-expanded
 * sections on Radius are the AMBIENT view of these picks; this panel
 * is the CONTROL view.
 *
 * Each section is editable inline. The interests grid mirrors the
 * /welcome step-3 layout (intentionally — recognition over recall).
 * The "Reset & re-onboard" affordance at the foot clears every
 * device-local pref + the onboarded cookie and sends the user back to
 * /welcome from a clean slate.
 */

// Mirrors INTEREST_OPTIONS in WelcomeFlow.tsx. Kept inline (not
// re-exported) to avoid a client→client cross-component dep, and to
// let the two surfaces evolve at slightly different speeds if needed.
const INTEREST_OPTIONS: Array<{
  slug: string;
  label: string;
  Icon: typeof Utensils;
  color: string;
}> = [
  { slug: "food", label: "Eat & drink", Icon: Utensils, color: "#A03A22" },
  { slug: "outdoors", label: "Parks & Trails", Icon: Trees, color: "#1E6B3A" },
  { slug: "arts", label: "Arts & Culture", Icon: Palette, color: "#7E2C6F" },
  { slug: "family", label: "Family", Icon: Baby, color: "#C99632" },
  { slug: "sports", label: "Sports", Icon: Activity, color: "#0F8A5F" },
  { slug: "shopping", label: "Shopping", Icon: ShoppingBag, color: "#B26B00" },
  { slug: "wellness", label: "Wellness", Icon: Heart, color: "#A02929" },
  { slug: "lodging", label: "Lodging", Icon: Hotel, color: "#5B1E55" },
];

const INTEREST_LABEL: Record<string, string> = Object.fromEntries(
  INTEREST_OPTIONS.map((o) => [o.slug, o.label]),
);

export default function PreferencesPanel() {
  const router = useRouter();
  const { mode, setMode, mounted } = useMode();

  // Local state mirrors localStorage. We seed it after mount to stay
  // SSR-safe and update both at once on every change.
  const [muni, setMuni] = useState<string | null>(null);
  const [interests, setInterestsState] = useState<Set<string>>(new Set());
  const [muniEditing, setMuniEditing] = useState(false);

  useEffect(() => {
    // SSR-safe: server renders the initial null/empty, the stored
    // values hydrate after mount. Same pattern other settings pages
    // use; the rule's overcautious for pure-hydration loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuni(getHomeMuni());
    setInterestsState(new Set(getInterests()));
  }, []);

  const changeMode = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      haptic("light");
      setMode(m);
    },
    [mode, setMode],
  );

  const changeMuni = useCallback((slug: string | null) => {
    haptic("light");
    setMuni(slug);
    setHomeMuni(slug);
    setMuniEditing(false);
  }, []);

  const toggleInterest = useCallback((slug: string) => {
    haptic("light");
    setInterestsState((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      setInterests([...next]);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    if (
      typeof window === "undefined" ||
      !window.confirm(
        "Clear all your preferences and re-do the welcome flow? This won't delete saved places.",
      )
    )
      return;
    haptic("medium");
    setHomeMuni(null);
    setInterests([]);
    resetModeState();
    document.cookie = "fr_onboarded=; path=/; max-age=0; samesite=lax";
    router.replace("/welcome");
  }, [router]);

  return (
    <div className="space-y-4">
      {/* PERSONA */}
      <SectionShell title="You're using Radius as" icon="persona">
        <div className="grid grid-cols-2 gap-2">
          {(["visitor", "resident"] as const).map((m) => {
            const active = mounted && mode === m;
            const Icon = m === "visitor" ? Compass : Home;
            return (
              <button
                key={m}
                type="button"
                onClick={() => changeMode(m)}
                aria-pressed={active}
                className="flex w-full items-center gap-2.5 rounded-xl border p-3 text-left text-[13px] font-semibold transition active:scale-[0.99]"
                style={{
                  borderColor: active ? "var(--app-brand)" : "var(--app-border)",
                  background: active
                    ? "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated))"
                    : "var(--app-bg-elevated)",
                  color: "var(--app-ink)",
                }}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                <span className="capitalize">{m}</span>
                {active && (
                  <Check
                    className="ml-auto h-4 w-4 shrink-0"
                    strokeWidth={3}
                    aria-hidden
                    style={{ color: "var(--app-brand)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {mode === "visitor"
            ? "Food, arts, and where to park. Downtown-weighted."
            : "What's open, what's closed, and civic happenings across the county."}
        </p>
      </SectionShell>

      {/* HOME MUNICIPALITY */}
      <SectionShell title="Your spot" icon="muni">
        {!muniEditing ? (
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setMuniEditing(true);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99]"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-elevated)",
            }}
          >
            <span className="inline-flex items-center gap-2">
              <MapPin
                className="h-4 w-4"
                strokeWidth={2.25}
                aria-hidden
                style={{ color: "var(--app-brand)" }}
              />
              <span className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                {muni
                  ? MUNICIPALITY_BY_SLUG[muni]?.name ?? muni
                  : "All of the county"}
              </span>
            </span>
            <span
              className="text-[12px] font-semibold"
              style={{ color: "var(--app-ink-3)" }}
            >
              Change
              <ChevronRight
                className="ml-0.5 inline h-3 w-3"
                strokeWidth={2.5}
                aria-hidden
              />
            </span>
          </button>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => changeMuni(null)}
              className="w-full rounded-xl border p-2.5 text-left text-[13px] font-semibold transition active:scale-[0.99]"
              style={{
                borderColor:
                  muni === null ? "var(--app-brand)" : "var(--app-border)",
                background: "var(--app-bg-elevated)",
                color: "var(--app-ink)",
              }}
            >
              All of the county
            </button>
            <ul className="grid grid-cols-2 gap-2">
              {MUNICIPALITIES.map((m) => (
                <li key={m.slug}>
                  <button
                    type="button"
                    onClick={() => changeMuni(m.slug)}
                    className="w-full rounded-xl border p-2.5 text-left text-[13px] font-medium transition active:scale-[0.99]"
                    style={{
                      borderColor:
                        muni === m.slug ? "var(--app-brand)" : "var(--app-border)",
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
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Seeds the Radius preset and the Today header.
        </p>
      </SectionShell>

      {/* INTERESTS */}
      <SectionShell title="What you're into" icon="interests">
        <ul className="grid grid-cols-2 gap-2">
          {INTEREST_OPTIONS.map((opt) => {
            const on = interests.has(opt.slug);
            return (
              <li key={opt.slug}>
                <button
                  type="button"
                  onClick={() => toggleInterest(opt.slug)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition active:scale-[0.99]"
                  style={{
                    borderColor: on ? opt.color : "var(--app-border)",
                    background: on
                      ? `color-mix(in srgb, ${opt.color} 8%, var(--app-bg-elevated))`
                      : "var(--app-bg-elevated)",
                  }}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                    style={{
                      background: `color-mix(in srgb, ${opt.color} 16%, transparent)`,
                      color: opt.color,
                    }}
                  >
                    <opt.Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                  </span>
                  <span
                    className="min-w-0 flex-1 text-[13px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {opt.label}
                  </span>
                  {on && (
                    <Check
                      className="h-3.5 w-3.5 shrink-0"
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
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {interests.size === 0
            ? "Nothing picked yet. Pre-expands matching sections on Radius."
            : `${interests.size} picked: ${[...interests]
                .map((s) => INTEREST_LABEL[s])
                .filter(Boolean)
                .join(", ")}.`}
        </p>
      </SectionShell>

      {/* NOTIFICATIONS — link to the existing dedicated page */}
      <Link
        href="/settings/notifications"
        onClick={() => haptic("light")}
        className="flex items-center justify-between gap-3 rounded-[var(--app-radius-lg)] border p-4 transition active:scale-[0.99]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <span className="inline-flex items-center gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{
              background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
              color: "var(--app-cool)",
            }}
          >
            <Bell className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </span>
          <span>
            <span
              className="block text-[14px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              Notifications
            </span>
            <span className="block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              Civic alerts, saved-event reminders, specials.
            </span>
          </span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0"
          strokeWidth={2.5}
          aria-hidden
          style={{ color: "var(--app-ink-3)" }}
        />
      </Link>

      {/* RESET */}
      <button
        type="button"
        onClick={reset}
        className="mt-2 inline-flex items-center gap-1.5 self-start text-[12px] font-medium"
        style={{ color: "var(--app-warning)" }}
      >
        <RotateCcw className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        Reset and re-do the welcome flow
      </button>
    </div>
  );
}

function SectionShell({
  title,
  icon,
  children,
}: {
  title: string;
  icon: "persona" | "muni" | "interests";
  children: React.ReactNode;
}) {
  const Icon =
    icon === "persona" ? Compass : icon === "muni" ? MapPin : Sparkles;
  const tint =
    icon === "persona"
      ? "var(--app-brand)"
      : icon === "muni"
        ? "var(--app-cool)"
        : "var(--app-positive)";
  return (
    <section
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <header className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden style={{ color: tint }} />
        <h2
          className="font-serif text-[15px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}
