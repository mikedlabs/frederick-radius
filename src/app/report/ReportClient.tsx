"use client";

import { track } from "@/lib/track";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Map, { type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useFrederickFlavorStyle } from "@/components/map/useFrederickFlavorStyle";
import {
  FREDERICK,
  FREDERICK_MAX_BOUNDS_FLAT,
  FREDERICK_MIN_ZOOM,
  FREDERICK_MAX_ZOOM,
  isInFrederickCounty,
} from "@/components/map/constants";
import { REPORT_CATEGORIES, REPORT_CATEGORY_BY_KEY } from "@/lib/reports/categories";
import {
  TriangleAlert, Activity, Lightbulb, MessageSquare, Construction, Footprints,
  Waves, Snowflake, LightbulbOff, TrafficCone, SquareParking, Mountain, Droplets,
  Hourglass, Users, Camera, type LucideIcon,
} from "lucide-react";

// Lucide icons for the report taxonomy. Kept in the UI layer (not the pure,
// server-shared categories.ts) and keyed by the same keys — DESIGN_TELLS:
// icons are lucide, never emoji.
const CATEGORY_ICON: Record<string, LucideIcon> = {
  hazard: TriangleAlert,
  condition: Activity,
  tip: Lightbulb,
  note: MessageSquare,
};
const SUBTYPE_ICON: Record<string, LucideIcon> = {
  pothole: Construction,
  sidewalk: Footprints,
  flooding: Waves,
  ice: Snowflake,
  light: LightbulbOff,
  debris: TrafficCone,
  parking_full: SquareParking,
  trail_muddy: Mountain,
  splash_pad_on: Droplets,
  long_line: Hourglass,
  crowded: Users,
};

function GlyphIcon({ Icon, className }: { Icon: LucideIcon | undefined; className?: string }) {
  const I = Icon ?? MessageSquare;
  return <I className={className} strokeWidth={2} aria-hidden />;
}

const PASS_KEY = "fr:collect:passcode";
const BY_KEY = "fr:collect:by";

type Status = { tone: "ok" | "error" | "info"; text: string } | null;

async function downscale(file: File, maxDim = 1280, quality = 0.8): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  let { width, height } = bmp;
  if (width > maxDim || height > maxDim) {
    const s = maxDim / Math.max(width, height);
    width = Math.round(width * s);
    height = Math.round(height * s);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}

export default function ReportClient({
  initialCamera = null,
}: {
  /** When arriving from the map's "Mark a spot" FAB, the map's current camera
   *  is carried through so /report opens on the exact spot you were looking at
   *  instead of the default downtown view. Parsed server-side from
   *  `?c=lng,lat,zoom`. */
  initialCamera?: { longitude: number; latitude: number; zoom: number } | null;
} = {}) {
  const router = useRouter();
  const mapRef = useRef<MapRef | null>(null);
  const mapStyle = useFrederickFlavorStyle();
  const [category, setCategory] = useState<string>("hazard");
  const [subtype, setSubtype] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [collectedBy, setCollectedBy] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [locating, setLocating] = useState(false);

  const def = REPORT_CATEGORY_BY_KEY[category];

  useEffect(() => {
    try {
      setPasscode(window.localStorage.getItem(PASS_KEY) ?? "");
      setCollectedBy(window.localStorage.getItem(BY_KEY) ?? "");
    } catch {
      /* private mode */
    }
  }, []);

  const flyTo = useCallback((lng: number, lat: number, zoom = 18) => {
    mapRef.current?.getMap().flyTo({ center: [lng, lat], zoom, duration: 700 });
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus({ tone: "error", text: "Your location is not available on this device." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        if (isInFrederickCounty(lng, lat)) flyTo(lng, lat, 18);
        else setStatus({ tone: "info", text: "You're outside Frederick County. Drag the map to the spot." });
      },
      () => {
        setLocating(false);
        setStatus({ tone: "info", text: "Couldn't get a fix. Drag the map so the crosshair is on the spot." });
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 8000 },
    );
  }, [flyTo]);

  // Reset subtype when switching to a category that doesn't have the current one.
  const subtypes = def?.subtypes ?? [];
  const activeSubtype = useMemo(
    () => ((def?.subtypes ?? []).some((s) => s.key === subtype) ? subtype : null),
    [def, subtype],
  );

  const onPickPhoto = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto(await downscale(file));
    } catch {
      setStatus({ tone: "error", text: "Couldn't read that photo." });
    }
  }, []);

  const submit = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const c = map.getCenter();
    const lng = c.lng;
    const lat = c.lat;
    if (!isInFrederickCounty(lng, lat)) {
      setStatus({ tone: "error", text: "That spot is outside Frederick County." });
      return;
    }
    if ((category === "tip" || category === "note") && !note.trim()) {
      setStatus({ tone: "error", text: "Add a few words so people know what it is." });
      return;
    }
    if (def?.photoRequired && !photo) {
      setStatus({ tone: "error", text: "A photo is required for a hazard." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subtype: activeSubtype || undefined,
          note: note.trim() || undefined,
          photo: photo || undefined,
          lng,
          lat,
          reportedBy: collectedBy.trim() || undefined,
          passcode: passcode || undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        const msg =
          d.error === "photo-required" ? "A photo is required for a hazard."
          : d.error === "need-text" ? "Add a few words about it."
          : d.error?.startsWith("rejected-") ? "That text looks like spam. Try plain words, no links."
          : d.error === "out-of-bounds" ? "That spot is outside Frederick County."
          : `Couldn't send (${d.error ?? res.status}).`;
        setStatus({ tone: "error", text: msg });
        return;
      }
      const d = (await res.json()) as { status?: string; queued?: boolean };
      track("report_submit", { category, queued: Boolean(d.queued) });
      setStatus(
        d.queued
          ? { tone: "ok", text: "Thanks. Sent for review; it'll appear once approved." }
          : { tone: "ok", text: "Your report is now on the map." },
      );
      setNote("");
      setPhoto(null);
      setSubtype(null);
    } catch {
      setStatus({ tone: "error", text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  }, [category, activeSubtype, note, photo, passcode, collectedBy, def]);

  return (
    <main className="relative bg-[var(--app-bg)] text-[var(--app-ink)]" style={{ height: "100dvh" }}>
      <div className="absolute inset-0">
        <Map
          ref={mapRef}
          initialViewState={initialCamera ?? { longitude: FREDERICK[0], latitude: FREDERICK[1], zoom: 15 }}
          mapStyle={mapStyle}
          style={{ width: "100%", height: "100%" }}
          attributionControl={{ compact: true }}
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
          maxBounds={FREDERICK_MAX_BOUNDS_FLAT}
          minZoom={FREDERICK_MIN_ZOOM}
          maxZoom={FREDERICK_MAX_ZOOM}
          reuseMaps
        />
      </div>

      {/* Center crosshair = where the report drops. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="14" fill="rgba(225,67,40,0.10)" stroke="var(--app-brand,#B5462B)" strokeWidth="2.5" />
          <line x1="24" y1="3" x2="24" y2="13" stroke="var(--app-brand,#B5462B)" strokeWidth="2.5" />
          <line x1="24" y1="35" x2="24" y2="45" stroke="var(--app-brand,#B5462B)" strokeWidth="2.5" />
          <line x1="3" y1="24" x2="13" y2="24" stroke="var(--app-brand,#B5462B)" strokeWidth="2.5" />
          <line x1="35" y1="24" x2="45" y2="24" stroke="var(--app-brand,#B5462B)" strokeWidth="2.5" />
          <circle cx="24" cy="24" r="3" fill="var(--app-brand,#B5462B)" />
        </svg>
      </div>

      <h1 className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-[var(--app-ink)]/85 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white shadow">
        Mark a spot
      </h1>

      {/* In-app exit — this full-bleed surface has no TopBar/BottomNav, so
          without this X the only way out is the browser chrome. Prefer real
          history; fall back to /map (the surface that links here) when the
          user landed cold via a deep link. */}
      <Link
        href="/map"
        onClick={(event) => {
          let sameOriginReferrer = false;
          try {
            sameOriginReferrer = Boolean(document.referrer) &&
              new URL(document.referrer).origin === window.location.origin;
          } catch {
            sameOriginReferrer = false;
          }
          if (sameOriginReferrer && window.history.length > 1) {
            event.preventDefault();
            router.back();
          }
        }}
        aria-label="Close and go back"
        className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--app-ink)]/15 bg-white text-[var(--app-ink)] shadow"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </Link>

      {/* Control card */}
      <div className="absolute inset-x-0 bottom-0 space-y-2.5 rounded-t-[var(--app-radius-lg,18px)] border-t border-[var(--app-ink)]/10 bg-[var(--app-bg)]/97 p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.6rem)] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
            aria-label="Use my location"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={locating ? "animate-spin" : undefined}>
              <circle cx="12" cy="12" r="7" />
              <line x1="12" y1="1" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="23" /><line x1="1" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="23" y2="12" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
            </svg>
            {locating ? "Locating…" : "My location"}
          </button>
          <p className="text-[11px] leading-tight text-[var(--app-ink)]/55">
            Line the crosshair up on the spot, pick what it is, send.
          </p>
        </div>

        {/* Category row */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1" style={{ scrollbarWidth: "none" }}>
          {REPORT_CATEGORIES.map((cat) => {
            const active = cat.key === category;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  setCategory(cat.key);
                  setSubtype(null);
                }}
                aria-pressed={active}
                className={`flex min-h-[50px] w-[76px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[var(--app-radius-md,12px)] border px-1 py-1.5 text-center transition-colors ${
                  active ? "border-[var(--app-brand,#B5462B)] bg-[var(--app-brand-tint-14)]" : "border-[var(--app-ink)]/12 bg-white/70"
                }`}
              >
                <GlyphIcon Icon={CATEGORY_ICON[cat.key]} className="h-[18px] w-[18px]" />
                <span className="text-[10px] font-medium leading-tight">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Subtype row (hazard / condition) */}
        {subtypes.length > 0 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1" style={{ scrollbarWidth: "none" }}>
            {subtypes.map((s) => {
              const on = s.key === activeSubtype;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSubtype(on ? null : s.key)}
                  aria-pressed={on}
                  className={`tap-44 inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-medium ${
                    on ? "border-[var(--app-brand,#B5462B)] bg-[var(--app-brand-tint-14)]" : "border-[var(--app-ink)]/15 bg-white/70"
                  }`}
                >
                  <GlyphIcon Icon={SUBTYPE_ICON[s.key]} className="h-3.5 w-3.5" />
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Note + photo */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            aria-label="Note"
            aria-required={category === "tip" || category === "note"}
            placeholder={category === "tip" || category === "note" ? "What is it? (required)" : "Add a detail (optional)"}
            className="min-h-11 min-w-0 flex-1 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--app-brand,#B5462B)]"
          />
          <label className={`tap-44 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--app-radius-md,12px)] border px-3 py-2.5 text-sm font-medium ${def?.photoRequired && !photo ? "border-[var(--app-brand,#B5462B)] text-[var(--app-brand,#B5462B)]" : "border-[var(--app-ink)]/15"}`}>
            <Camera className="h-4 w-4" strokeWidth={2} aria-hidden />
            {def?.photoRequired ? "Photo*" : ""}
            <input type="file" accept="image/*" capture="environment" aria-label={def?.photoRequired ? "Add photo (required)" : "Add photo (optional)"} className="hidden" onChange={(e) => onPickPhoto(e.target.files?.[0])} />
          </label>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- local capture preview (data URL)
            <img src={photo} alt="Preview" className="h-10 w-10 shrink-0 rounded-md object-cover" />
          )}
        </div>

        {/* Optional trusted passcode (instant post) */}
        <button type="button" onClick={() => setShowPass((s) => !s)} className="tap-44 text-[11px] font-medium text-[var(--app-ink)]/55">
          {showPass ? "Hide" : passcode ? "Passcode set · posts instantly" : "Have a passcode? (posts instantly)"}
        </button>
        {showPass && (
          <input
            type="password"
            aria-label="Trusted passcode"
            value={passcode}
            onChange={(e) => {
              const v = e.target.value;
              setPasscode(v);
              try {
                if (v) window.localStorage.setItem(PASS_KEY, v);
                else window.localStorage.removeItem(PASS_KEY);
              } catch {
                /* ignore */
              }
            }}
            placeholder="Passcode (optional)"
            autoComplete="off"
            className="min-h-11 w-full rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--app-brand,#B5462B)]"
          />
        )}

        {status && (
          <p className={`text-center text-sm ${status.tone === "ok" ? "text-[var(--app-positive,#315A43)]" : status.tone === "error" ? "text-[var(--app-brand,#B5462B)]" : "text-[var(--app-ink)]/70"}`} role="status">
            {status.text}
          </p>
        )}

        <p className="text-center text-[10px] leading-[1.35] text-[var(--app-ink)]/60">
          Reports may be public with this exact map point. Don&apos;t include faces or private
          information; only share content you have the right to post. By sending, you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2">Terms</Link> and acknowledge our{" "}
          <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
        </p>

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="w-full rounded-[var(--app-radius-md,12px)] bg-[var(--app-brand-press)] py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Sending…" : `Mark ${def?.label?.toLowerCase() ?? "it"}`}
        </button>
      </div>
    </main>
  );
}
