"use client";

import { useState, useTransition } from "react";
import { ArrowRight, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Plan, PlanInputs } from "@/lib/integrations/planner";
import { generatePlan } from "./actions";
import { formatDistance } from "@/lib/geo";

const AUDIENCES: { value: PlanInputs["audience"]; label: string; emoji: string }[] = [
  { value: "solo", label: "Solo", emoji: "🧍" },
  { value: "date", label: "Date", emoji: "💞" },
  { value: "family", label: "Family", emoji: "👨‍👩‍👧" },
  { value: "friends", label: "Friends", emoji: "👥" },
  { value: "visitor", label: "Visitor", emoji: "🧳" },
];

const VIBES: { value: PlanInputs["vibe"]; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "active", label: "Active" },
  { value: "cultural", label: "Cultural" },
  { value: "outdoors", label: "Outdoors" },
  { value: "food", label: "Food first" },
];

const DURATIONS: PlanInputs["duration_hours"][] = [2, 3, 4, 6];

export default function PlanBuilder() {
  const [audience, setAudience] = useState<PlanInputs["audience"]>("date");
  const [vibe, setVibe] = useState<PlanInputs["vibe"]>("easy");
  const [hours, setHours] = useState<PlanInputs["duration_hours"]>(3);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pending, startTransition] = useTransition();

  const onBuild = () => {
    startTransition(async () => {
      const result = await generatePlan({ audience, vibe, duration_hours: hours });
      setPlan(result);
    });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)]"
               style={{ borderColor: "var(--app-border)" }}>
        <Field label="Who you're with">
          <ChipRow>
            {AUDIENCES.map((a) => (
              <Chip key={a.value} active={a.value === audience} onClick={() => setAudience(a.value)} accent="brand">
                <span aria-hidden>{a.emoji}</span> {a.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label="The vibe">
          <ChipRow>
            {VIBES.map((v) => (
              <Chip key={v.value} active={v.value === vibe} onClick={() => setVibe(v.value)} accent="cool">
                {v.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label="How long">
          <ChipRow>
            {DURATIONS.map((d) => (
              <Chip key={d} active={d === hours} onClick={() => setHours(d)} accent="cool">
                {d}h
              </Chip>
            ))}
          </ChipRow>
        </Field>
        <button
          type="button"
          onClick={onBuild}
          disabled={pending}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--app-shadow-1)] transition disabled:opacity-60"
          style={{ background: "var(--app-brand)" }}
        >
          <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
          {pending ? "Building your plan…" : plan ? "Build a new plan" : "Build my plan"}
        </button>
      </section>

      {plan && (
        <section className="space-y-4">
          <header>
            <h2 className="font-serif text-2xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              {plan.title}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--app-ink-3)" }}>{plan.summary}</p>
            {plan.narrative && (
              <p className="mt-2 rounded-[var(--app-radius-md)] border-l-2 pl-3 text-[13px] italic leading-relaxed"
                 style={{ borderColor: "var(--app-cool)", color: "var(--app-ink-2)" }}>
                {plan.narrative}
              </p>
            )}
          </header>

          {plan.stops.length === 0 ? (
            <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-sm"
               style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
              No verified matches for that combo — try a different vibe or audience.
            </p>
          ) : (
            <ol className="relative space-y-3 pl-8">
              <div className="absolute left-3 top-3 bottom-3 w-px" style={{ background: "var(--app-border)" }} aria-hidden />
              {plan.stops.map((stop) => (
                <li key={stop.order} className="relative">
                  <span
                    className="absolute -left-7 top-3 grid h-6 w-6 place-items-center rounded-full font-serif text-xs font-bold text-white shadow-[var(--app-shadow-1)]"
                    style={{ background: "var(--app-brand)" }}
                    aria-hidden
                  >
                    {stop.order}
                  </span>
                  <article
                    className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)]"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    {stop.place ? (
                      <Link href={`/places/${stop.place.slug}`} className="block group">
                        <h3 className="font-serif text-lg font-semibold tracking-tight transition-colors group-hover:underline" style={{ color: "var(--app-ink)" }}>
                          {stop.place.name}
                        </h3>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
                          <MapPin className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden /> {stop.place.address}, {stop.place.city}
                        </p>
                        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                          {stop.why}
                        </p>
                        <p className="mt-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--app-cool)" }}>
                          ≈ {stop.duration_min} min
                        </p>
                      </Link>
                    ) : stop.event ? (
                      <Link href={`/events/${stop.event.slug}`} className="block group">
                        <h3 className="font-serif text-lg font-semibold tracking-tight transition-colors group-hover:underline" style={{ color: "var(--app-ink)" }}>
                          {stop.event.title}
                        </h3>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
                          <MapPin className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden /> {stop.event.venue_name}
                        </p>
                        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                          {stop.why}
                        </p>
                      </Link>
                    ) : null}
                  </article>
                </li>
              ))}
            </ol>
          )}

          {plan.stops.length > 0 && (
            <div className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-xs"
                 style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
              Every recommendation is from our verified list. Hours and operational status will be cross-checked
              against Google Places once the API key is configured.
              {plan.stops[0]?.place && (
                <> Total radius: ~{formatDistance(estimateTotalRadius(plan))}.</>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function estimateTotalRadius(plan: Plan): number {
  let max = 0;
  let baseLng: number | null = null;
  let baseLat: number | null = null;
  for (const s of plan.stops) {
    const p = s.place ?? null;
    if (!p) continue;
    if (baseLng === null) {
      baseLng = p.geom.lng;
      baseLat = p.geom.lat;
      continue;
    }
    const dLng = (p.geom.lng - baseLng) * 111320 * Math.cos((baseLat ?? 0) * Math.PI / 180);
    const dLat = (p.geom.lat - (baseLat ?? 0)) * 111320;
    max = Math.max(max, Math.sqrt(dLng * dLng + dLat * dLat));
  }
  return max;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 scrollbar-hide">
      <div className="flex min-w-max gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active, accent = "brand", onClick, children,
}: { active: boolean; accent?: "brand" | "cool"; onClick: () => void; children: React.ReactNode }) {
  const accentColor = accent === "cool" ? "var(--app-cool)" : "var(--app-brand)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? accentColor : "var(--app-border)",
        background: active ? accentColor : "var(--app-bg-elevated)",
        color: active ? "white" : "var(--app-ink-2)",
      }}
    >
      {children}
      {active && <ArrowRight className="h-3 w-3 opacity-0" aria-hidden />}
    </button>
  );
}
