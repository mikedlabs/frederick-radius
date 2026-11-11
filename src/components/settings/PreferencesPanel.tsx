"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
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
import KeepRadiusCard from "@/components/pwa/KeepRadiusCard";
import PhoneFeedbackCard from "@/components/settings/PhoneFeedbackCard";
import { resetModeState } from "@/hooks/useMode";
import { ACCENTS } from "@/data/categories";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import {
  getHomeMuni,
  setHomeMuni,
  getInterests,
  setInterests,
  getCommunityNotes,
  setCommunityNotes,
} from "@/lib/personalize";
import {
  applyAppearance,
  getAppearance,
  subscribeAppearance,
  type Appearance,
} from "@/lib/appearance";
import { haptic } from "@/lib/haptics";
import { BRAND } from "@/lib/brand";
import {
  cancelPendingReturnBridgeValue,
  shouldSignalHomeAreaValue,
  signalReturnBridgeValue,
} from "@/lib/return-bridge";
import {
  askFitSummary,
  readAskFitContext,
  writeAskFitContext,
  type AskFitContext,
} from "@/lib/ask/fit";

/**
 * PreferencesPanel — the editable settings hub.
 *
 * Surfaces every device-local pick the user made (Where, Fit, Interests,
 * Community notes, Appearance, Phone feedback) in one place so they
 * can see what's been saved and change anything. The chips on Today + the pre-expanded
 * sections on Radius are the AMBIENT view of these picks; this panel
 * is the CONTROL view.
 *
 * Each section is a heading under a hairline rule, so the control inside it
 * is the only bordered element. The interests grid mirrors the
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
  { slug: "food", label: "Eat & drink", Icon: Utensils, color: ACCENTS.terracotta },
  { slug: "outdoors", label: "Parks & Trails", Icon: Trees, color: ACCENTS.catoctin },
  { slug: "arts", label: "Arts & Culture", Icon: Palette, color: ACCENTS.plum },
  { slug: "family", label: "Family", Icon: Baby, color: ACCENTS.family },
  { slug: "sports", label: "Sports", Icon: Activity, color: BRAND.colors.creek },
  { slug: "shopping", label: "Shopping", Icon: ShoppingBag, color: BRAND.colors.functionalAmber },
  { slug: "wellness", label: "Wellness", Icon: Heart, color: "#A02929" },
  { slug: "lodging", label: "Lodging", Icon: Hotel, color: "#5B1E55" },
];

const INTEREST_LABEL: Record<string, string> = Object.fromEntries(
  INTEREST_OPTIONS.map((o) => [o.slug, o.label]),
);

export default function PreferencesPanel() {
  const router = useRouter();

  // Local state mirrors localStorage. We seed it after mount to stay
  // SSR-safe and update both at once on every change.
  const [muni, setMuni] = useState<string | null>(null);
  const [interests, setInterestsState] = useState<Set<string>>(new Set());
  const [muniEditing, setMuniEditing] = useState(false);
  const [communityOn, setCommunityOn] = useState(true);
  const [fit, setFit] = useState<AskFitContext>({});
  // The same store the header toggle reads, so both controls stay in step.
  const appearance = useSyncExternalStore<Appearance>(
    subscribeAppearance,
    getAppearance,
    () => "light",
  );

  useEffect(() => {
    // SSR-safe: server renders the initial null/empty, the stored
    // values hydrate after mount. Same pattern other settings pages
    // use; the rule's overcautious for pure-hydration loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuni(getHomeMuni());
    setInterestsState(new Set(getInterests()));
    setCommunityOn(getCommunityNotes());
    setFit(readAskFitContext());
  }, []);

  const changeMuni = useCallback((slug: string | null) => {
    const previous = getHomeMuni();
    haptic("light");
    setMuni(slug);
    setHomeMuni(slug);
    if (shouldSignalHomeAreaValue(previous, slug)) {
      signalReturnBridgeValue("home-area");
    }
    if (!slug) cancelPendingReturnBridgeValue("home-area");
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

  const toggleCommunity = useCallback(() => {
    haptic("light");
    setCommunityOn((prev) => {
      const next = !prev;
      setCommunityNotes(next);
      return next;
    });
  }, []);

  const changeFit = useCallback(<K extends keyof AskFitContext>(
    key: K,
    value: AskFitContext[K] | undefined,
  ) => {
    haptic("light");
    setFit((previous) => {
      const next = { ...previous, [key]: value };
      return writeAskFitContext(next);
    });
  }, []);

  const toggleAccess = useCallback((value: "wheelchair" | "communication") => {
    haptic("light");
    setFit((previous) => {
      const access = new Set(previous.accessibility ?? []);
      if (access.has(value)) access.delete(value);
      else access.add(value);
      const next: AskFitContext = { ...previous, accessibility: [...access] };
      if (access.size === 0) next.accessibility = undefined;
      return writeAskFitContext(next);
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
    cancelPendingReturnBridgeValue("home-area");
    setInterests([]);
    writeAskFitContext({});
    setFit({});
    resetModeState();
    document.cookie = "fr_onboarded=; path=/; max-age=0; samesite=lax";
    router.replace("/welcome");
  }, [router]);

  return (
    <div className="space-y-6">
      {/* HOME MUNICIPALITY */}
      <SectionShell title="Your spot">
        {!muniEditing ? (
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setMuniEditing(true);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-[var(--app-radius-md)] border p-3 text-left transition active:scale-[0.99]"
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
              className="w-full rounded-[var(--app-radius-md)] border p-2.5 text-left text-[13px] font-semibold transition active:scale-[0.99]"
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
                    className="w-full rounded-[var(--app-radius-md)] border p-2.5 text-left text-[13px] font-medium transition active:scale-[0.99]"
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
          Sets where Today and the Map start from.
        </p>
      </SectionShell>

      {/* FIT DEFAULTS — kept in Settings instead of adding another filter row
          to Ask. Every value is an explicit enum; no notes or location data. */}
      <SectionShell title="What fits">
        <details className="group">
          <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
            <span className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              {askFitSummary(fit) ?? "No defaults set"}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
          </summary>
          <div className="mt-3 space-y-4">
            <ChoiceGroup
              label="Nearby"
              value={fit.travelMode}
              choices={[[undefined, "Any distance"], ["walk", "Keep it walkable"]]}
              onChange={(value) => changeFit("travelMode", value as AskFitContext["travelMode"])}
            />
            <ChoiceGroup
              label="Walking"
              value={fit.walkingTolerance}
              choices={[[undefined, "Flexible"], ["short", "Shorter"], ["moderate", "Moderate"]]}
              onChange={(value) => changeFit("walkingTolerance", value as AskFitContext["walkingTolerance"])}
            />
            <ChoiceGroup
              label="Going with"
              value={fit.family}
              choices={[[undefined, "Anyone"], ["young-kids", "Young kids"], ["school-age", "School-age"], ["teens", "Teens"]]}
              onChange={(value) => changeFit("family", value as AskFitContext["family"])}
            />
            <ChoiceGroup
              label="Budget"
              value={fit.budget}
              choices={[[undefined, "Flexible"], ["free", "Free"], ["value", "Good value"]]}
              onChange={(value) => changeFit("budget", value as AskFitContext["budget"])}
            />
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>Access</p>
              <div className="flex flex-wrap gap-2">
                {([[
                  "wheelchair",
                  "Wheelchair access",
                ], ["communication", "Communication access"]] as const).map(([value, label]) => (
                  <ChoiceChip key={value} on={fit.accessibility?.includes(value) ?? false} onClick={() => toggleAccess(value)}>
                    {label}
                  </ChoiceChip>
                ))}
              </div>
            </div>
          </div>
        </details>
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Ask uses these as quiet defaults. What you type always wins, and no notes or location history are stored.
        </p>
      </SectionShell>

      {/* INTERESTS */}
      <SectionShell title="What you're into">
        <ul className="grid grid-cols-2 gap-2">
          {INTEREST_OPTIONS.map((opt) => {
            const on = interests.has(opt.slug);
            return (
              <li key={opt.slug}>
                <button
                  type="button"
                  onClick={() => toggleInterest(opt.slug)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-2 rounded-[var(--app-radius-md)] border p-2.5 text-left transition active:scale-[0.99]"
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
            ? "You have not picked anything yet. Your choices determine what leads on Today."
            : `${interests.size} picked: ${[...interests]
                .map((s) => INTEREST_LABEL[s])
                .filter(Boolean)
                .join(", ")}.`}
        </p>
      </SectionShell>

      {/* COMMUNITY NOTES — one topic-neutral switch for the whole quiet
          community layer on Today (Pride Month, Sunday places of worship). */}
      <SectionShell title="Community notes">
        <div
          className="flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border p-3"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <span className="min-w-0 flex-1 text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {communityOn ? "Showing" : "Hidden"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={communityOn}
            aria-label="Show community notes"
            onClick={toggleCommunity}
            className="tap-44 relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
            style={{ background: communityOn ? "var(--app-brand)" : "color-mix(in srgb, var(--app-ink) 22%, transparent)" }}
          >
            <span
              className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
              style={{ transform: communityOn ? "translateX(22px)" : "translateX(2px)", boxShadow: "var(--app-elev-1)" }}
            />
          </button>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Today can show relevant cultural observances and community resources.
          Turn this off to hide those notes.
        </p>
      </SectionShell>

      {/* APPEARANCE: the same saved choice as the header toggle, given a
          home beside the other device preferences. */}
      <SectionShell title="Appearance">
        <ChoiceGroup
          label="Appearance"
          labelHidden
          value={appearance}
          choices={[["light", "Light"], ["dark", "Dark"]]}
          onChange={(value) => {
            haptic("light");
            applyAppearance(value === "dark" ? "dark" : "light");
          }}
        />
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Your choice is saved on this device and applies to every page.
        </p>
      </SectionShell>

      {/* PHONE FEEDBACK: the device-local haptics switch. It moved here from
          the retired /settings/notifications page. */}
      <PhoneFeedbackCard />

      <KeepRadiusCard id="keep-radius" openFromHash />

      {/* RESET */}
      <button
        type="button"
        onClick={reset}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 self-start text-[12px] font-medium"
        style={{ color: "var(--app-warning-press)" }}
      >
        <RotateCcw className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        Reset and re-do the welcome flow
      </button>
    </div>
  );
}

function SectionShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="border-t pt-5"
      style={{ borderColor: "var(--app-border)" }}
    >
      <h2
        id={headingId}
        className="mb-3 text-[17px] font-semibold leading-tight tracking-[-0.01em]"
        style={{ color: "var(--app-ink)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function ChoiceChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="tap-44-y rounded-full border px-3 py-2 text-[12px] font-semibold"
      style={{
        borderColor: on ? "var(--app-brand)" : "var(--app-border)",
        background: on
          ? "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated))"
          : "var(--app-bg-elevated)",
        color: "var(--app-ink)",
      }}
    >
      {children}
    </button>
  );
}

function ChoiceGroup({
  label,
  labelHidden = false,
  value,
  choices,
  onChange,
}: {
  label: string;
  /** The section heading already names the group, so keep the legend for assistive tech only. */
  labelHidden?: boolean;
  value?: string;
  choices: ReadonlyArray<readonly [string | undefined, string]>;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <fieldset>
      <legend
        className={labelHidden ? "sr-only" : "mb-2 text-[11px] font-bold uppercase tracking-[0.08em]"}
        style={{ color: "var(--app-ink-3)" }}
      >
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {choices.map(([choice, choiceLabel]) => (
          <ChoiceChip key={choice ?? "any"} on={value === choice} onClick={() => onChange(choice)}>
            {choiceLabel}
          </ChoiceChip>
        ))}
      </div>
    </fieldset>
  );
}
