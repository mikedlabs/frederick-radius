"use client";

import { useState, useTransition } from "react";
import { Sparkles, MapPin, Navigation, Share2, RefreshCw, X, Clock } from "lucide-react";
import Link from "next/link";
import type { Plan, PlanInputs } from "@/lib/integrations/planner";
import { generatePlan, removeStop, swapStop } from "./actions";
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
type StartMode = "now" | "afternoon" | "evening";
const STARTS: { value: StartMode; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

/** Local clock time for a preset, as an ISO string the planner accepts. */
function startAtFor(mode: StartMode): string | undefined {
  if (mode === "now") return undefined;
  const d = new Date();
  d.setHours(mode === "afternoon" ? 14 : 18, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); // next occurrence
  return d.toISOString();
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

const OPEN_LABEL: Record<Plan["stops"][number]["open"], { text: string; color: string }> = {
  open: { text: "Open", color: "var(--app-positive)" },
  likely: { text: "Likely open", color: "var(--app-warning)" },
  unknown: { text: "Hours not confirmed", color: "var(--app-ink-3)" },
  closed: { text: "May be closed", color: "var(--app-warning)" },
};

export default function PlanBuilder({
  initialPlan,
  initialInputs,
  shared = false,
}: {
  initialPlan?: Plan;
  initialInputs?: Partial<PlanInputs>;
  shared?: boolean;
}) {
  const [audience, setAudience] = useState<PlanInputs["audience"]>(initialInputs?.audience ?? "date");
  const [vibe, setVibe] = useState<PlanInputs["vibe"]>(initialInputs?.vibe ?? "easy");
  const [hours, setHours] = useState<PlanInputs["duration_hours"]>(initialInputs?.duration_hours ?? 3);
  const [startMode, setStartMode] = useState<StartMode>("now");
  const [near, setNear] = useState<{ lng: number; lat: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(initialPlan ?? null);
  const [editing, setEditing] = useState(!shared);
  const [busy, setBusy] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setNear({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      (err) =>
        setGeoMsg(
          err && err.code === 1
            ? "Location is off. Enable it to plan from where you are."
            : "Could not get your location. Using downtown Frederick.",
        ),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const onBuild = () => {
    startTransition(async () => {
      const result = await generatePlan({
        audience,
        vibe,
        duration_hours: hours,
        start_at: startAtFor(startMode),
        start_near: near ?? undefined,
      });
      setPlan(result);
      setEditing(true);
    });
  };

  const mutate = (fn: () => Promise<Plan | null>, idx: number | null) => {
    setBusy(idx);
    startTransition(async () => {
      const result = await fn();
      if (result) setPlan(result);
      setBusy(null);
    });
  };

  const onShare = async () => {
    if (!plan) return;
    const url = `${window.location.origin}/plan?p=${plan.share}`;
    try {
      if (navigator.share) await navigator.share({ title: plan.title, text: plan.summary, url });
      else {
        await navigator.clipboard.writeText(url);
        setGeoMsg("Link copied. Paste it to share this plan.");
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <div className="space-y-5">
      {(!shared || editing) && (
        <section
          className="space-y-3 rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-shadow-1)]"
          style={{ borderColor: "var(--app-border)" }}
        >
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
          <Field label="Start">
            <ChipRow>
              {STARTS.map((s) => (
                <Chip key={s.value} active={s.value === startMode} onClick={() => setStartMode(s.value)} accent="cool">
                  {s.label}
                </Chip>
              ))}
              <Chip active={near != null} onClick={useMyLocation} accent="brand">
                <Navigation className="h-3 w-3" aria-hidden /> {near ? "Using your spot" : "Near me"}
              </Chip>
            </ChipRow>
          </Field>
          {geoMsg && (
            <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>{geoMsg}</p>
          )}
          <button
            type="button"
            onClick={onBuild}
            disabled={pending}
            className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--app-shadow-1)] transition disabled:opacity-60"
            style={{ background: "var(--app-brand)" }}
          >
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            {pending && busy === null ? "Building your plan…" : plan ? "Build a new plan" : "Build my plan"}
          </button>
        </section>
      )}

      {plan && (
        <section className="space-y-4">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                {plan.title}
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--app-ink-3)" }}>{plan.summary}</p>
            </div>
            {plan.stops.length > 0 && (
              <button
                type="button"
                onClick={onShare}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden /> Share
              </button>
            )}
          </header>

          {shared && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white"
              style={{ background: "var(--app-brand)" }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Make it your own
            </button>
          )}

          {plan.narrative && (
            <p
              className="rounded-[var(--app-radius-md)] border-l-2 pl-3 text-[13px] italic leading-relaxed"
              style={{ borderColor: "var(--app-cool)", color: "var(--app-ink-2)" }}
            >
              {plan.narrative}
            </p>
          )}

          {plan.stops.length === 0 ? (
            <p
              className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-sm"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              No good matches for that combo. Try a different vibe, more time, or a wider start.
            </p>
          ) : (
            <ol className="relative space-y-3 pl-8">
              <div className="absolute left-3 top-3 bottom-3 w-px" style={{ background: "var(--app-border)" }} aria-hidden />
              {plan.stops.map((stop, idx) => {
                const href = stop.place ? `/places/${stop.place.slug}` : stop.event ? `/events/${stop.event.slug}` : "#";
                const name = stop.place?.name ?? stop.event?.title ?? "";
                const where = stop.place ? `${stop.place.address}, ${stop.place.city}` : stop.event?.venue_name ?? "";
                const geom = stop.place?.geom ?? stop.event?.geom;
                const ol = OPEN_LABEL[stop.open];
                return (
                  <li key={`${stop.order}-${name}`} className="relative">
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
                      <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--app-cool)" }}>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden /> {clock(stop.at)} · {stop.duration_min} min
                        </span>
                        <span className="inline-flex items-center gap-1" style={{ color: ol.color }}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ol.color }} aria-hidden />
                          {ol.text}
                        </span>
                      </div>
                      <Link href={href} className="mt-1.5 block group">
                        <h3 className="font-serif text-lg font-semibold tracking-tight transition-colors group-hover:underline" style={{ color: "var(--app-ink)" }}>
                          {name}
                        </h3>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
                          <MapPin className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
                          {where}
                        </p>
                        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                          {stop.why}
                        </p>
                      </Link>
                      <div className="mt-3 flex items-center gap-2">
                        {geom && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${geom.lat},${geom.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                          >
                            <Navigation className="h-3 w-3" aria-hidden /> Directions
                          </a>
                        )}
                        {editing && stop.place && (
                          <>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => mutate(() => swapStop(plan.share, idx), idx)}
                              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                            >
                              <RefreshCw className={`h-3 w-3 ${busy === idx ? "animate-spin" : ""}`} aria-hidden /> Swap
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => mutate(() => removeStop(plan.share, idx), idx)}
                              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
                            >
                              <X className="h-3 w-3" aria-hidden /> Remove
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}

          {plan.stops.length > 0 && (
            <div
              className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-xs"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              Every stop is a real, operational place from our directory, nothing invented.
              {plan.stops[0]?.place && <> Total radius: ~{formatDistance(estimateTotalRadius(plan))}.</>}
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
    const g = s.place?.geom ?? s.event?.geom;
    if (!g) continue;
    if (baseLng === null) {
      baseLng = g.lng;
      baseLat = g.lat;
      continue;
    }
    const dLng = (g.lng - baseLng) * 111320 * Math.cos(((baseLat ?? 0) * Math.PI) / 180);
    const dLat = (g.lat - (baseLat ?? 0)) * 111320;
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
  active,
  accent = "brand",
  onClick,
  children,
}: {
  active: boolean;
  accent?: "brand" | "cool";
  onClick: () => void;
  children: React.ReactNode;
}) {
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
    </button>
  );
}
