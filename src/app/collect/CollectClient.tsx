"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import {
  FREDERICK,
  FREDERICK_MAX_BOUNDS,
  FREDERICK_MIN_ZOOM,
  FREDERICK_MAX_ZOOM,
  STYLE_URL,
  isInFrederickCounty,
} from "@/components/map/constants";

/** The fixed set of types the collector can drop. kind matches the
 *  AmenityKind union + /api/collect's allow-list; glyph + label are the
 *  one-tap picker. Verb-free nouns: the collector is naming a thing. */
const TYPES: { kind: string; label: string; glyph: string }[] = [
  { kind: "trash", label: "Trash", glyph: "\u{1F5D1}\u{FE0F}" },
  { kind: "recycling", label: "Recycling", glyph: "\u{267B}\u{FE0F}" },
  { kind: "water", label: "Water", glyph: "\u{1F6B0}" },
  { kind: "bench", label: "Bench", glyph: "\u{1FA91}" },
  { kind: "ev_charging", label: "EV charging", glyph: "\u{26A1}" },
  { kind: "outlet", label: "Outlet", glyph: "\u{1F50C}" },
  { kind: "dog_water", label: "Dog water", glyph: "\u{1F43E}" },
  { kind: "dog_waste", label: "Dog bags", glyph: "\u{1F4A9}" },
  { kind: "restroom", label: "Restroom", glyph: "\u{1F6BB}" },
  { kind: "other", label: "Other", glyph: "\u{2795}" },
];

const PASS_KEY = "fr:collect:passcode";
const BY_KEY = "fr:collect:by";

type RecentPoint = { id: string; kind: string; lng: number; lat: number };
type Status = { tone: "ok" | "error" | "info"; text: string } | null;

export default function CollectClient() {
  const mapRef = useRef<MapRef | null>(null);
  const [kind, setKind] = useState<string>("trash");
  const [note, setNote] = useState("");
  const [passcode, setPasscode] = useState("");
  const [collectedBy, setCollectedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [recent, setRecent] = useState<RecentPoint[]>([]);
  const [userPos, setUserPos] = useState<{ lng: number; lat: number } | null>(null);
  const [located, setLocated] = useState(false);

  // Hydrate the remembered passcode + collector name (set once per device).
  useEffect(() => {
    try {
      setPasscode(window.localStorage.getItem(PASS_KEY) ?? "");
      setCollectedBy(window.localStorage.getItem(BY_KEY) ?? "");
    } catch {
      /* private mode — fields just start empty */
    }
  }, []);

  // Load what's already been collected so the map shows prior work.
  useEffect(() => {
    let alive = true;
    fetch("/api/collect")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: RecentPoint[] }) => {
        if (alive && Array.isArray(d.items)) {
          setRecent(
            d.items
              .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
              .map((p) => ({ id: p.id, kind: p.kind, lng: p.lng, lat: p.lat })),
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const flyTo = useCallback((lng: number, lat: number, zoom = 17) => {
    mapRef.current?.getMap().flyTo({ center: [lng, lat], zoom, duration: 800 });
  }, []);

  // One-shot GPS on mount: center on the collector if they're in-county.
  const locate = useCallback(
    (fly: boolean) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setStatus({ tone: "error", text: "Location isn't available on this device." });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lng = pos.coords.longitude;
          const lat = pos.coords.latitude;
          setUserPos({ lng, lat });
          setLocated(true);
          if (fly && isInFrederickCounty(lng, lat)) flyTo(lng, lat, 17);
        },
        () => {
          setStatus({ tone: "info", text: "Couldn't get your location. Move the map so the crosshair is on the spot." });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
      );
    },
    [flyTo],
  );

  useEffect(() => {
    locate(true);
  }, [locate]);

  const rememberField = (key: string, value: string) => {
    try {
      if (value) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  const selected = TYPES.find((t) => t.kind === kind);

  const add = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const c = map.getCenter();
    const lng = c.lng;
    const lat = c.lat;

    if (!isInFrederickCounty(lng, lat)) {
      setStatus({ tone: "error", text: "That spot is outside Frederick County." });
      return;
    }
    if (!passcode) {
      setStatus({ tone: "error", text: "Enter the passcode first." });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          lng,
          lat,
          note: note.trim() || undefined,
          collectedBy: collectedBy.trim() || undefined,
          passcode,
        }),
      });
      if (res.status === 401) {
        setStatus({ tone: "error", text: "Passcode incorrect." });
        return;
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ tone: "error", text: `Couldn't save (${d.error ?? res.status}).` });
        return;
      }
      const d = (await res.json()) as { id?: string };
      setRecent((prev) => [{ id: d.id ?? `tmp-${prev.length}`, kind, lng, lat }, ...prev]);
      setStatus({ tone: "ok", text: `${selected?.label ?? "Point"} added.` });
      setNote("");
    } catch {
      setStatus({ tone: "error", text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  }, [kind, note, passcode, collectedBy, selected]);

  return (
    <div
      className="relative flex flex-col bg-[var(--app-bg)] text-[var(--app-ink)]"
      style={{ height: "100dvh" }}
    >
      {/* Map fills the top; the crosshair marks where the point lands. */}
      <div className="relative flex-1">
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: FREDERICK[0], latitude: FREDERICK[1], zoom: 15 }}
          mapStyle={STYLE_URL}
          style={{ width: "100%", height: "100%" }}
          attributionControl={true}
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
          maxBounds={FREDERICK_MAX_BOUNDS}
          minZoom={FREDERICK_MIN_ZOOM}
          maxZoom={FREDERICK_MAX_ZOOM}
          reuseMaps
        >
          {userPos && (
            <Marker longitude={userPos.lng} latitude={userPos.lat} anchor="center">
              <span className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--app-brand-2,#2F5470)] shadow" />
            </Marker>
          )}
          {recent.map((p) => (
            <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
              <span className="block h-2.5 w-2.5 rounded-full border border-white bg-[var(--app-brand,#E14328)] opacity-80" />
            </Marker>
          ))}
        </Map>

        {/* Fixed center crosshair — the spot a new point will be dropped. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="13" fill="none" stroke="var(--app-brand,#E14328)" strokeWidth="2.5" />
            <line x1="22" y1="2" x2="22" y2="12" stroke="var(--app-brand,#E14328)" strokeWidth="2.5" />
            <line x1="22" y1="32" x2="22" y2="42" stroke="var(--app-brand,#E14328)" strokeWidth="2.5" />
            <line x1="2" y1="22" x2="12" y2="22" stroke="var(--app-brand,#E14328)" strokeWidth="2.5" />
            <line x1="32" y1="22" x2="42" y2="22" stroke="var(--app-brand,#E14328)" strokeWidth="2.5" />
            <circle cx="22" cy="22" r="2.5" fill="var(--app-brand,#E14328)" />
          </svg>
        </div>

        {/* Locate button */}
        <button
          type="button"
          onClick={() => locate(true)}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[var(--app-ink)] shadow-md"
          aria-label="Center on my location"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="1" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="23" />
            <line x1="1" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="23" y2="12" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          </svg>
        </button>

        {/* Count badge */}
        <div className="absolute left-3 top-3 rounded-full bg-[var(--app-ink)]/85 px-3 py-1.5 font-mono text-xs text-white shadow">
          {recent.length} marked
        </div>
      </div>

      {/* Control panel */}
      <div className="shrink-0 space-y-3 border-t border-[var(--app-ink)]/10 bg-[var(--app-bg)] p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
        {!located && (
          <p className="text-center text-xs text-[var(--app-ink)]/60">
            Line the crosshair up on the spot, pick a type, then Add.
          </p>
        )}

        {/* Type picker — one tap, labeled icons. */}
        <div className="grid grid-cols-5 gap-1.5">
          {TYPES.map((t) => {
            const active = t.kind === kind;
            return (
              <button
                key={t.kind}
                type="button"
                onClick={() => setKind(t.kind)}
                aria-pressed={active}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-[var(--app-radius-md,12px)] border px-1 py-1.5 text-center transition-colors ${
                  active
                    ? "border-[var(--app-brand,#E14328)] bg-[var(--app-brand-tint-2,rgba(225,67,40,0.12))]"
                    : "border-[var(--app-ink)]/12 bg-white/60"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden="true">{t.glyph}</span>
                <span className="text-[10px] font-medium leading-tight">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Optional note (prompted for "Other"). */}
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          placeholder={kind === "other" ? "What is it? (required for Other)" : "Note (optional)"}
          className="w-full rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--app-brand,#E14328)]"
        />

        {/* Passcode + collector name — collapsed-feeling, set once. */}
        <div className="flex gap-2">
          <input
            type="password"
            value={passcode}
            onChange={(e) => {
              setPasscode(e.target.value);
              rememberField(PASS_KEY, e.target.value);
            }}
            placeholder="Passcode"
            autoComplete="off"
            className="w-1/2 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--app-brand,#E14328)]"
          />
          <input
            type="text"
            value={collectedBy}
            onChange={(e) => {
              setCollectedBy(e.target.value);
              rememberField(BY_KEY, e.target.value);
            }}
            maxLength={60}
            placeholder="Your name (optional)"
            className="w-1/2 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--app-brand,#E14328)]"
          />
        </div>

        {status && (
          <p
            className={`text-center text-sm ${
              status.tone === "ok"
                ? "text-[var(--app-brand-2,#2F5470)]"
                : status.tone === "error"
                  ? "text-[var(--app-brand,#E14328)]"
                  : "text-[var(--app-ink)]/70"
            }`}
            role="status"
          >
            {status.text}
          </p>
        )}

        <button
          type="button"
          onClick={add}
          disabled={saving}
          className="w-full rounded-[var(--app-radius-md,12px)] bg-[var(--app-brand,#E14328)] py-3.5 text-base font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Adding…" : `Add ${selected?.label ?? "point"} here`}
        </button>
      </div>
    </div>
  );
}
