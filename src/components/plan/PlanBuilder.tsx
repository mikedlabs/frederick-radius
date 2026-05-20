"use client";

import { useState, useTransition } from "react";
import { Sparkles, MapPin, Navigation, Share2, RefreshCw, X, Clock, Wand2, Shuffle } from "lucide-react";
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

const VIBES: { value: PlanInputs["vibe"]; label: string; emoji: string }[] = [
  { value: "easy", label: "Easy", emoji: "🌿" },
  { value: "active", label: "Active", emoji: "⚡️" },
  { value: "cultural", label: "Cultural", emoji: "🎭" },
  { value: "outdoors", label: "Outdoors", emoji: "🥾" },
  { value: "food", label: "Food first", emoji: "🍽️" },
];

const DURATIONS: PlanInputs["duration_hours"][] = [2, 3, 4, 6];
type StartMode = "now" | "afternoon" | "evening";
const STARTS: { value: StartMode; label: string; emoji: string }[] = [
  { value: "now", label: "Now", emoji: "⏱️" },
  { value: "afternoon", label: "Afternoon", emoji: "🌤️" },
  { value: "evening", label: "Evening", emoji: "🌆" },
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

  const onBuild = (seed?: number) => {
    startTransition(async () => {
      const result = await generatePlan({
        audience,
        vibe,
        duration_hours: hours,
        start_at: startAtFor(startMode),
        start_near: near ?? undefined,
        seed,
      });
      setPlan(result);
      setEditing(true);
    });
  };

  /** Shuffle = rebuild with a fresh random seed, same inputs. Same
   *  vibe and audience, different but valid combination of stops. */
  const onShuffle = () => onBuild(Math.floor(Math.random() * 100_000));

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

  const building = pending && busy === null;

  return (
    <div className="space-y-5">
      {(!shared || editing) && (
        <section
          className="tactile tactile-e2 space-y-4 rounded-[var(--app-radius-xl)] bg-[var(--app-bg-elevated)] p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 55%, var(--app-cool)))" }}
            >
              <Wand2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </span>
            <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>Design your night</p>
          </div>

          <Field label="Who you're with">
            <ChipRow>
              {AUDIENCES.map((a) => (
                <Chip key={a.value} active={a.value === audience} onClick={() => setAudience(a.value)} accent="brand">
                  <span aria-hidden className="text-[15px] leading-none">{a.emoji}</span> {a.label}
                </Chip>
              ))}
            </ChipRow>
          </Field>
          <Field label="The vibe">
            <ChipRow>
              {VIBES.map((v) => (
                <Chip key={v.value} active={v.value === vibe} onClick={() => setVibe(v.value)} accent="cool">
                  <span aria-hidden className="text-[15px] leading-none">{v.emoji}</span> {v.label}
                </Chip>
              ))}
            </ChipRow>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="How long">
              <ChipRow>
                {DURATIONS.map((d) => (
                  <Chip key={d} active={d === hours} onClick={() => setHours(d)} accent="cool">
                    {d} hours
                  </Chip>
                ))}
              </ChipRow>
            </Field>
            <Field label="Start">
              <ChipRow>
                {STARTS.map((s) => (
                  <Chip key={s.value} active={s.value === startMode} onClick={() => setStartMode(s.value)} accent="cool">
                    <span aria-hidden className="text-[15px] leading-none">{s.emoji}</span> {s.label}
                  </Chip>
                ))}
                <Chip active={near != null} onClick={useMyLocation} accent="brand">
                  <Navigation className="h-3.5 w-3.5" aria-hidden /> {near ? "Your spot" : "Near me"}
                </Chip>
              </ChipRow>
            </Field>
          </div>
          {geoMsg && (
            <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>{geoMsg}</p>
          )}
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => onBuild()}
              disabled={pending}
              className="tactile tactile-lift group relative inline-flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-[var(--app-radius-md)] px-4 py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-70"
              style={{
                background: "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 60%, var(--app-cool)))",
                transitionTimingFunction: "var(--app-ease-spring)",
              }}
            >
              <Sparkles className={`h-4 w-4 ${building ? "animate-spin" : "transition-transform group-hover:rotate-12"}`} strokeWidth={2.25} aria-hidden />
              {building ? "Stitching your night together…" : plan ? "Build a new plan" : "Build my evening"}
            </button>
            {plan && (
              <button
                type="button"
                onClick={onShuffle}
                disabled={pending}
                aria-label="Shuffle this plan"
                title="Same vibe, different stops"
                className="tactile tactile-interactive inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)] px-4 py-3.5 text-[13px] font-semibold disabled:opacity-70"
                style={{ color: "var(--app-ink-2)" }}
              >
                <Shuffle className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} strokeWidth={2.25} aria-hidden />
                Shuffle
              </button>
            )}
          </div>
        </section>
      )}

      {plan && (
        <section className="space-y-4">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="display-2" style={{ color: "var(--app-ink)" }}>
                {plan.title}
              </h2>
              <p className="mt-1 text-[14px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-3)" }}>{plan.summary}</p>
            </div>
            {plan.stops.length > 0 && (
              <button
                type="button"
                onClick={onShare}
                className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--app-bg-elevated)] px-3.5 py-2 text-xs font-semibold"
                style={{ color: "var(--app-ink-2)" }}
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden /> Share
              </button>
            )}
          </header>

          {shared && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="tactile tactile-lift inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white transition active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 60%, var(--app-cool)))",
                transitionTimingFunction: "var(--app-ease-spring)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Make it your own
            </button>
          )}

          {plan.narrative && (
            <figure
              className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4 pl-5"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: "linear-gradient(var(--app-brand), var(--app-cool))" }}
              />
              <figcaption className="eyebrow mb-1" style={{ color: "var(--app-cool)" }}>The night, in a sentence</figcaption>
              <blockquote className="font-serif text-[15px] italic leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {plan.narrative}
              </blockquote>
            </figure>
          )}

          {plan.stops.length === 0 ? (
            <div
              className="tactile flex flex-col items-center gap-2 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] px-6 py-10 text-center"
            >
              <span
                aria-hidden
                className="grid h-12 w-12 place-items-center rounded-full text-2xl"
                style={{ background: "color-mix(in srgb, var(--app-brand) 12%, transparent)" }}
              >
                🗺️
              </span>
              <p className="font-serif text-base font-semibold" style={{ color: "var(--app-ink)" }}>
                No clean match for that combo
              </p>
              <p className="max-w-xs text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                Try a different vibe, give it more time, or start &ldquo;Near me&rdquo; for a wider net.
              </p>
            </div>
          ) : (
            <ol className="stagger relative space-y-3 pl-9">
              <span
                className="absolute bottom-4 left-[15px] top-4 w-[2px] rounded-full"
                style={{ background: "linear-gradient(var(--app-brand), var(--app-cool))", opacity: 0.55 }}
                aria-hidden
              />
              {plan.stops.map((stop, idx) => {
                const href = stop.place ? `/places/${stop.place.slug}` : stop.event ? `/events/${stop.event.slug}` : "#";
                const name = stop.place?.name ?? stop.event?.title ?? "";
                const where = stop.place ? `${stop.place.address}, ${stop.place.city}` : stop.event?.venue_name ?? "";
                const geom = stop.place?.geom ?? stop.event?.geom;
                const ol = OPEN_LABEL[stop.open];
                return (
                  <li key={`${stop.order}-${name}`} className="relative">
                    <span
                      className="absolute -left-9 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-full font-serif text-sm font-bold text-white"
                      style={{
                        background: "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 55%, var(--app-cool)))",
                        boxShadow: "var(--app-elev-2), 0 0 0 4px var(--app-bg)",
                      }}
                      aria-hidden
                    >
                      {stop.order}
                    </span>
                    <article
                      className="tactile tactile-interactive overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
                    >
                      {/* Photo banner — when the stop has a real Google
                          photo, lead with the image. Time-block + open
                          chips overlay so the card still answers "when
                          and is it open." */}
                      {stop.photo_url && (
                        <div className="relative h-32 w-full overflow-hidden bg-[var(--app-bg-sunken)]">
                          {/* eslint-disable-next-line @next/next/no-img-element -- proxied/remote photo, plain img avoids domain allowlist */}
                          <img
                            src={stop.photo_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                          <span
                            className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold tabular-nums"
                            style={{ color: "var(--app-cool)" }}
                          >
                            <Clock className="h-3 w-3" aria-hidden /> {clock(stop.at)} · {stop.duration_min} min
                          </span>
                          <span
                            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold"
                            style={{ color: ol.color }}
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ol.color }} aria-hidden />
                            {ol.text}
                          </span>
                        </div>
                      )}
                      <div className="p-4">
                      {!stop.photo_url && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
                            style={{ background: "color-mix(in srgb, var(--app-cool) 12%, transparent)", color: "var(--app-cool)" }}
                          >
                            <Clock className="h-3 w-3" aria-hidden /> {clock(stop.at)} · {stop.duration_min} min
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: ol.color }}>
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ol.color }} aria-hidden />
                            {ol.text}
                          </span>
                        </div>
                      )}
                      <Link href={href} className="group mt-2 block">
                        <h3 className="font-serif text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:underline" style={{ color: "var(--app-ink)" }}>
                          {name}
                        </h3>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
                          <MapPin className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
                          {where}
                        </p>
                        <p className="mt-2 text-[13px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
                          {stop.why}
                        </p>
                      </Link>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {geom && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${geom.lat},${geom.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tactile tactile-interactive inline-flex items-center gap-1 rounded-full bg-[var(--app-bg-elevated)] px-3 py-1.5 text-[11px] font-semibold"
                            style={{ color: "var(--app-ink-2)" }}
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
                              className="tactile tactile-interactive inline-flex items-center gap-1 rounded-full bg-[var(--app-bg-elevated)] px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                              style={{ color: "var(--app-ink-2)" }}
                            >
                              <RefreshCw className={`h-3 w-3 ${busy === idx ? "animate-spin" : ""}`} aria-hidden /> Swap
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => mutate(() => removeStop(plan.share, idx), idx)}
                              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--app-bg-sunken)] disabled:opacity-50"
                              style={{ color: "var(--app-ink-3)" }}
                            >
                              <X className="h-3 w-3" aria-hidden /> Remove
                            </button>
                          </>
                        )}
                      </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}

          {plan.stops.length > 0 && (
            <p
              className="flex items-start gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px] leading-relaxed"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
              <span>
                Every stop is a real, operational place from our directory — nothing invented.
                {plan.stops[0]?.place && <> Total radius ~{formatDistance(estimateTotalRadius(plan))}.</>}
              </span>
            </p>
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
      <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  // Wrapped — every option visible at once, no hidden horizontal scroll.
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
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
      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition active:scale-[0.94]"
      style={{
        borderColor: active ? accentColor : "var(--app-border)",
        background: active ? accentColor : "var(--app-bg-elevated)",
        color: active ? "white" : "var(--app-ink-2)",
        boxShadow: active ? "var(--app-elev-2)" : "var(--app-elev-1)",
        transitionTimingFunction: "var(--app-ease-spring)",
      }}
    >
      {children}
    </button>
  );
}
