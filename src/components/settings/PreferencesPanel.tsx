"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
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
import {
  ROW_HELP,
  ROW_TITLE,
  SECTION_LABEL,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
  TOGGLE_CLASS,
  helpStyle,
  inkStyle,
  toggleStyle,
} from "@/components/settings/SettingsSection";
import { resetModeState } from "@/hooks/useMode";
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
 * PreferencesPanel: the editable settings hub.
 *
 * Surfaces every device-local pick the user made (Where, Fit, Interests,
 * Community notes, Appearance, Phone feedback) in one place so they
 * can see what's been saved and change anything. The chips on Today + the pre-expanded
 * sections on Radius are the AMBIENT view of these picks; this panel
 * is the CONTROL view.
 *
 * Each section is a 13px uppercase label over ruled rows on the page ground
 * (see SettingsSection). Only real controls keep a border: the interest and
 * home-area toggles and the Appearance pair, all 6px with an ink fill when
 * selected. The interests grid mirrors the /welcome step-3 layout
 * (intentionally, for recognition over recall).
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
}> = [
  { slug: "food", label: "Eat & drink", Icon: Utensils },
  { slug: "outdoors", label: "Parks & Trails", Icon: Trees },
  { slug: "arts", label: "Arts & Culture", Icon: Palette },
  { slug: "family", label: "Family", Icon: Baby },
  { slug: "sports", label: "Sports", Icon: Activity },
  { slug: "shopping", label: "Shopping", Icon: ShoppingBag },
  { slug: "wellness", label: "Wellness", Icon: Heart },
  { slug: "lodging", label: "Lodging", Icon: Hotel },
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
    <div className="flex flex-col gap-8">
      {/* HOME MUNICIPALITY */}
      <SettingsSection title="Your spot">
        <SettingsRow>
          {!muniEditing ? (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setMuniEditing(true);
              }}
              // tap-44-y keeps the 44px target without a 44px box, so the
              // help line sits as close to this title as in the Sign in row.
              className="tap-44-y flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-left"
            >
              <span className={`min-w-0 [overflow-wrap:anywhere] ${ROW_TITLE}`} style={inkStyle}>
                {muni
                  ? MUNICIPALITY_BY_SLUG[muni]?.name ?? muni
                  : "All of the county"}
              </span>
              <span
                className="inline-flex shrink-0 items-center text-[0.875rem] font-semibold"
                style={{ color: "var(--app-ink-2)" }}
              >
                Change
                <ChevronRight
                  className="ml-0.5 h-4 w-4"
                  strokeWidth={2.25}
                  aria-hidden
                />
              </span>
            </button>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => changeMuni(null)}
                aria-pressed={muni === null}
                className={TOGGLE_CLASS}
                style={toggleStyle(muni === null)}
              >
                All of the county
              </button>
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2">
                {MUNICIPALITIES.map((m) => (
                  <li key={m.slug} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => changeMuni(m.slug)}
                      aria-pressed={muni === m.slug}
                      className={`${TOGGLE_CLASS} h-full`}
                      style={toggleStyle(muni === m.slug)}
                    >
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className={`${muniEditing ? "mt-2" : "mt-0.5"} ${ROW_HELP}`} style={helpStyle}>
            Sets where Today and the Map start from.
          </p>
        </SettingsRow>
      </SettingsSection>

      {/* FIT DEFAULTS: kept in Settings instead of adding another filter row
          to Ask. Every value is an explicit enum; no notes or location data. */}
      <SettingsSection title="What fits">
        <SettingsRow>
          <details className="group">
            <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className={`min-w-0 [overflow-wrap:anywhere] ${ROW_TITLE}`} style={inkStyle}>
                {askFitSummary(fit) ?? "No defaults set"}
              </span>
              <ChevronRight
                className="h-5 w-5 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                strokeWidth={2.25}
                aria-hidden
                style={{ color: "var(--app-ink-3)" }}
              />
            </summary>
            <div className="mt-3 space-y-4 pb-2">
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
                <p className={`mb-2 ${SECTION_LABEL}`} style={helpStyle}>Access</p>
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
          <p className={`mt-0.5 ${ROW_HELP}`} style={helpStyle}>
            Ask uses these as quiet defaults. What you type always wins, and no notes or location history are stored.
          </p>
        </SettingsRow>
      </SettingsSection>

      {/* INTERESTS: these are controls, so each keeps a 6px border. */}
      <SettingsSection title="What you're into">
        <SettingsRow>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2">
            {INTEREST_OPTIONS.map((opt) => {
              const on = interests.has(opt.slug);
              return (
                <li key={opt.slug} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleInterest(opt.slug)}
                    aria-pressed={on}
                    className={`${TOGGLE_CLASS} h-full`}
                    style={toggleStyle(on)}
                  >
                    {/* A plain glyph in the button's own ink: no tile or tint. */}
                    <opt.Icon
                      className="h-5 w-5 shrink-0"
                      strokeWidth={2}
                      aria-hidden
                      style={{ color: on ? "currentColor" : "var(--app-ink-3)" }}
                    />
                    <span className="min-w-0 flex-1 break-words">{opt.label}</span>
                    {on && (
                      <Check className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className={`mt-2 ${ROW_HELP}`} style={helpStyle}>
            {interests.size === 0
              ? "You have not picked anything yet. Your choices determine what leads on Today."
              : `${interests.size} picked: ${[...interests]
                  .map((s) => INTEREST_LABEL[s])
                  .filter(Boolean)
                  .join(", ")}.`}
          </p>
        </SettingsRow>
      </SettingsSection>

      {/* COMMUNITY NOTES: one topic-neutral switch for the whole quiet
          community layer on Today (Pride Month, Sunday places of worship). */}
      <SettingsSection title="Community notes">
        <SettingsRow
          trailing={
            <SettingsSwitch
              checked={communityOn}
              label="Show community notes"
              onClick={toggleCommunity}
            />
          }
        >
          <p className={ROW_TITLE} style={inkStyle}>
            {communityOn ? "Showing" : "Hidden"}
          </p>
          <p className={`mt-0.5 ${ROW_HELP}`} style={helpStyle}>
            Today can show relevant cultural observances and community resources.
            Turn this off to hide those notes.
          </p>
        </SettingsRow>
      </SettingsSection>

      {/* APPEARANCE: the same saved choice as the header toggle, given a
          home beside the other device preferences. */}
      <SettingsSection title="Appearance">
        <SettingsRow
          trailing={
            <ChoiceGroup
              label="Appearance"
              labelHidden
              shape="segment"
              value={appearance}
              choices={[["light", "Light"], ["dark", "Dark"]]}
              onChange={(value) => {
                haptic("light");
                applyAppearance(value === "dark" ? "dark" : "light");
              }}
            />
          }
        >
          <p className={ROW_HELP} style={helpStyle}>
            Your choice is saved on this device and applies to every page.
          </p>
        </SettingsRow>
      </SettingsSection>

      {/* PHONE FEEDBACK: the device-local haptics switch. It moved here from
          the retired /settings/notifications page. */}
      <PhoneFeedbackCard />

      <KeepRadiusCard id="keep-radius" openFromHash />

      {/* RESET */}
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-[0.875rem] font-semibold"
        style={{ color: "var(--app-ink-2)" }}
      >
        <RotateCcw className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        Reset and re-do the welcome flow
      </button>
    </div>
  );
}

/**
 * A compact choice chip. Chips keep the full capsule; the selected state is
 * an ink fill. The `segment` shape is the 6px two-option control used by
 * Appearance, with the same aria-pressed semantics.
 */
function ChoiceChip({
  on,
  onClick,
  shape = "chip",
  children,
}: {
  on: boolean;
  onClick: () => void;
  shape?: "chip" | "segment";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={
        shape === "segment"
          ? "min-h-11 min-w-[5.5rem] max-w-full rounded-[var(--app-radius-md)] border px-4 text-[0.9375rem] font-semibold [overflow-wrap:anywhere] transition-colors motion-reduce:transition-none"
          : "tap-44-y max-w-full rounded-full border px-3 py-2 text-left text-[0.8125rem] font-semibold leading-tight [overflow-wrap:anywhere] transition-colors motion-reduce:transition-none"
      }
      style={toggleStyle(on)}
    >
      {children}
    </button>
  );
}

function ChoiceGroup({
  label,
  labelHidden = false,
  shape = "chip",
  value,
  choices,
  onChange,
}: {
  label: string;
  /** The section heading already names the group, so keep the legend for assistive tech only. */
  labelHidden?: boolean;
  shape?: "chip" | "segment";
  value?: string;
  choices: ReadonlyArray<readonly [string | undefined, string]>;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <fieldset>
      <legend
        className={labelHidden ? "sr-only" : `mb-2 ${SECTION_LABEL}`}
        style={helpStyle}
      >
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {choices.map(([choice, choiceLabel]) => (
          <ChoiceChip
            key={choice ?? "any"}
            shape={shape}
            on={value === choice}
            onClick={() => onChange(choice)}
          >
            {choiceLabel}
          </ChoiceChip>
        ))}
      </div>
    </fieldset>
  );
}
