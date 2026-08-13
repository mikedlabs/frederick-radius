"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useFrederickFlavorStyle } from "@/components/map/useFrederickFlavorStyle";
import {
  CAM_EASE,
  FREDERICK,
  FREDERICK_MAX_BOUNDS_FLAT,
  FREDERICK_MIN_ZOOM,
  FREDERICK_MAX_ZOOM,
  isInFrederickCounty,
} from "@/components/map/constants";
import {
  Trash2, Recycle, Droplet, Armchair, Zap, Plug, PawPrint, Dog, Plus,
  type LucideIcon,
} from "lucide-react";
import RestroomMark from "@/components/icons/RestroomMark";

/** Fixed picker types. kind matches the AmenityKind union + /api/collect's
 *  allow-list; Icon + label are the one-tap picker; color tints the dot.
 *  Icons are lucide, never emoji (DESIGN_TELLS). */
const TYPES: { kind: string; label: string; Icon: LucideIcon; color: string }[] = [
  { kind: "trash", label: "Trash", Icon: Trash2, color: "#4A4A48" },
  { kind: "recycling", label: "Recycling", Icon: Recycle, color: "#315A43" },
  { kind: "water", label: "Water", Icon: Droplet, color: "#285D73" },
  { kind: "bench", label: "Bench", Icon: Armchair, color: "#7A7975" },
  { kind: "ev_charging", label: "EV", Icon: Zap, color: "#315A43" },
  { kind: "outlet", label: "Outlet", Icon: Plug, color: "#4A4A48" },
  { kind: "dog_water", label: "Dog water", Icon: PawPrint, color: "#285D73" },
  { kind: "dog_waste", label: "Dog bags", Icon: Dog, color: "#315A43" },
  { kind: "restroom", label: "Restroom", Icon: RestroomMark, color: "#285D73" },
  { kind: "other", label: "Other", Icon: Plus, color: "#B5462B" },
];
const COLOR_FOR = (kind: string) => TYPES.find((t) => t.kind === kind)?.color ?? "#B5462B";

const PASS_KEY = "fr:collect:passcode";
const BY_KEY = "fr:collect:by";
const MODE_KEY = "fr:collect:mode";
const QUEUE_KEY = "fr:collect:queue";

/** Aim is the original stand-still flow: line the crosshair up, tap Add.
 *  Ride is for moving (scooter, bike): a live GPS watch follows you and
 *  every type button is a one-tap "tag it right here". */
type Mode = "aim" | "ride";

type Fix = { lng: number; lat: number; accuracy: number; at: number };

/** A ride tag waiting to be sent. Persisted to localStorage so a reload
 *  or a dead spot mid-ride can't lose what was already tagged. */
type QueuedTag = { tempId: string; kind: string; lng: number; lat: number; collectedBy?: string };

type RecentPoint = {
  id: string;
  /** Stable client id for ride tags; how a marker survives its server id
   *  arriving later (and how Undo finds it in either state). */
  clientId?: string;
  kind: string;
  note: string;
  photo: string | null;
  lng: number;
  lat: number;
};
type Status = { tone: "ok" | "error" | "info"; text: string } | null;

/** Ride tags carry their q- client id as the marker id until the server
 *  confirms; that prefix is what "still sending" means throughout. */
const isPendingId = (id: string) => id.startsWith("q-");

const newTempId = () =>
  `q-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

/** How stale a fix can be and still be a trustworthy drop point. At riding
 *  speed even 10 seconds is roughly 70 m, so a watch that has gone quiet
 *  must block tagging rather than drop a pin far behind the rider. */
const FIX_MAX_AGE_MS = 12_000;

/** Hard cap so an hours-long dead zone can't grow the queue without bound. */
const QUEUE_MAX = 100;

const remember = (key: string, value: string) => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

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

export default function CollectClient() {
  const mapRef = useRef<MapRef | null>(null);
  const mapStyle = useFrederickFlavorStyle();
  const [mode, setMode] = useState<Mode>("aim");
  const [kind, setKind] = useState<string>("trash");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [collectedBy, setCollectedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [recent, setRecent] = useState<RecentPoint[]>([]);
  const [userPos, setUserPos] = useState<{ lng: number; lat: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoBlocked, setGeoBlocked] = useState(false);
  const [editing, setEditing] = useState<RecentPoint | null>(null);
  // Passcode/name live behind a disclosure once a passcode is set, to keep the
  // panel short on a phone (more map = easier placement).
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Ride mode state ────────────────────────────────────────────────
  // The freshest GPS fix lives in a ref so a tap reads it synchronously;
  // the state mirror only drives the accuracy readout.
  const fixRef = useRef<Fix | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  // Follow camera: on until the rider drags the map away; a pinch only
  // pauses it briefly instead of turning it off.
  const followRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const gestureUntilRef = useRef(0);
  // The send queue. The ref is authoritative (the flusher mutates it
  // between awaits); state mirrors it for the "sending" count.
  const queueRef = useRef<QueuedTag[]>([]);
  const [queued, setQueued] = useState<QueuedTag[]>([]);
  const flushingRef = useRef(false);
  const backoffUntilRef = useRef(0);
  const inFlightRef = useRef<string | null>(null);
  // Undo pressed while that tag's POST was in flight: remember to delete
  // it as soon as the server hands back its real id.
  const undoWantedRef = useRef<Set<string>>(new Set());
  const [lastTag, setLastTag] = useState<{ tempId: string; label: string } | null>(null);

  const persistQueue = useCallback((next: QueuedTag[]) => {
    queueRef.current = next;
    setQueued(next);
    try {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
    } catch {
      /* private mode or full; the in-memory queue still sends */
    }
  }, []);

  useEffect(() => {
    try {
      const pc = window.localStorage.getItem(PASS_KEY) ?? "";
      setPasscode(pc);
      setCollectedBy(window.localStorage.getItem(BY_KEY) ?? "");
      if (!pc) setSettingsOpen(true);
      if (window.localStorage.getItem(MODE_KEY) === "ride") setMode("ride");
      const rawQueue = window.localStorage.getItem(QUEUE_KEY);
      if (rawQueue) {
        const parsed = JSON.parse(rawQueue) as unknown;
        const restored = (Array.isArray(parsed) ? parsed : []).filter(
          (q): q is QueuedTag =>
            !!q &&
            typeof q === "object" &&
            typeof (q as QueuedTag).tempId === "string" &&
            isPendingId((q as QueuedTag).tempId) &&
            typeof (q as QueuedTag).kind === "string" &&
            Number.isFinite((q as QueuedTag).lng) &&
            Number.isFinite((q as QueuedTag).lat),
        );
        if (restored.length > 0) {
          queueRef.current = restored;
          setQueued(restored);
          // Bring unsent tags back as pending dots so the ride resumes
          // exactly where a reload interrupted it.
          setRecent((prev) => [
            ...restored.map((q) => ({
              id: q.tempId,
              clientId: q.tempId,
              kind: q.kind,
              note: "",
              photo: null,
              lng: q.lng,
              lat: q.lat,
            })),
            ...prev,
          ]);
        }
      }
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/collect")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: { id: string; kind: string; note: string | null; photo_url: string | null; lng: number; lat: number }[] }) => {
        if (alive && Array.isArray(d.items)) {
          // Merge, don't replace: pending ride tags restored from the queue
          // (or added before this GET resolved) must survive.
          const server = d.items
            .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
            .map((p) => ({ id: p.id, kind: p.kind, note: p.note ?? "", photo: p.photo_url ?? null, lng: p.lng, lat: p.lat }));
          setRecent((prev) => [...prev.filter((p) => isPendingId(p.id)), ...server]);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const flyTo = useCallback((lng: number, lat: number, zoom = 18) => {
    mapRef.current?.getMap().flyTo({ center: [lng, lat], zoom, duration: 700 });
  }, []);

  // Locate: recenter the map on the live GPS fix (the crosshair = where the pin
  // drops, so "use my location" = move the crosshair onto me). Robust handling
  // of denied/unavailable so mobile never silently does nothing.
  const locate = useCallback(
    (fly: boolean) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setGeoBlocked(true);
        setStatus({ tone: "error", text: "Your location is not available on this device." });
        return;
      }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          setGeoBlocked(false);
          const lng = pos.coords.longitude;
          const lat = pos.coords.latitude;
          setUserPos({ lng, lat });
          if (!isInFrederickCounty(lng, lat)) {
            setStatus({ tone: "info", text: "You're outside Frederick County. Drag the map to the spot." });
            return;
          }
          if (fly) flyTo(lng, lat, 18);
        },
        (err) => {
          setLocating(false);
          if (err.code === err.PERMISSION_DENIED) {
            setGeoBlocked(true);
            setStatus({ tone: "error", text: "Location is blocked. Allow location for this site, or drag the map to the spot." });
          } else {
            setStatus({ tone: "info", text: "Couldn't get a fix. Drag the map so the crosshair is on the spot." });
          }
        },
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 8000 },
      );
    },
    [flyTo],
  );

  useEffect(() => {
    locate(true);
  }, [locate]);

  // ── Ride mode: continuous GPS watch + follow camera ────────────────
  useEffect(() => {
    if (mode !== "ride") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoBlocked(true);
      setStatus({ tone: "error", text: "Your location is not available on this device." });
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const f: Fix = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          at: Date.now(),
        };
        fixRef.current = f;
        setFix(f);
        setGeoBlocked(false);
        setUserPos({ lng: f.lng, lat: f.lat });
        if (!followRef.current || Date.now() < gestureUntilRef.current) return;
        const map = mapRef.current?.getMap();
        if (!map || !isInFrederickCounty(f.lng, f.lat)) return;
        // Fixes arrive about once a second; easeTo restarts smoothly each
        // time, which reads as the map gliding along under the rider.
        map.easeTo({ center: [f.lng, f.lat], duration: prefersReducedMotion() ? 0 : 900, easing: CAM_EASE, essential: true });
      },
      (err) => {
        // Timeouts are transient (tree cover, indoors); the fix-age guard
        // already blocks tagging on them. Denial is worth saying out loud.
        if (err.code === err.PERMISSION_DENIED) {
          setGeoBlocked(true);
          setStatus({ tone: "error", text: "Location is blocked. Allow location for this site to tag while riding." });
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [mode]);

  // Keep the screen awake during a ride. Without this the phone sleeps
  // between tags and every stop becomes unlock, relocate, retag.
  useEffect(() => {
    if (mode !== "ride") return;
    type Sentinel = { release: () => Promise<void> };
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } }).wakeLock;
    if (!wakeLock) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      wakeLock
        .request("screen")
        .then((s) => {
          if (cancelled) void s.release().catch(() => {});
          else sentinel = s;
        })
        .catch(() => {
          /* unsupported or low battery; riding still works, the screen just sleeps */
        });
    };
    // The platform releases the lock whenever the tab hides; take it back.
    const onVisibility = () => acquire();
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [mode]);

  // ── Ride mode: the send queue ──────────────────────────────────────
  // One flusher drains the queue head-first. Network failure keeps the
  // item and stops (the retry timer and the online event resume); a
  // server rejection drops just that item so it can't dam the rest.
  const flushQueue = useCallback(async () => {
    if (flushingRef.current || !passcode) return;
    if (Date.now() < backoffUntilRef.current) return;
    flushingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current[0];
        inFlightRef.current = item.tempId;
        let res: Response;
        try {
          res = await fetch("/api/collect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: item.kind,
              lng: item.lng,
              lat: item.lat,
              collectedBy: item.collectedBy,
              passcode,
            }),
          });
        } catch {
          setStatus({ tone: "info", text: "No signal right now. Tags are saved and will send when you're back online." });
          break;
        }
        if (res.status === 401) {
          // A brief pause also keeps retyping the passcode from firing a
          // 401 per keystroke while tags wait in the queue.
          backoffUntilRef.current = Date.now() + 3_000;
          setSettingsOpen(true);
          setStatus({ tone: "error", text: "The passcode is incorrect." });
          break;
        }
        if (res.status === 429) {
          // Server-side rate limit. Hold off instead of hammering the window.
          backoffUntilRef.current = Date.now() + 60_000;
          setStatus({ tone: "info", text: "Sending is paused for a minute. Your tags are safe in the queue." });
          break;
        }
        if (!res.ok) {
          // Bad coords or kind can never succeed on retry. Drop it.
          persistQueue(queueRef.current.filter((q) => q.tempId !== item.tempId));
          setRecent((prev) => prev.filter((p) => p.clientId !== item.tempId));
          undoWantedRef.current.delete(item.tempId);
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          setStatus({ tone: "error", text: `One tag couldn't be saved (${d.error ?? res.status}).` });
          continue;
        }
        const d = (await res.json().catch(() => ({}))) as { id?: string };
        persistQueue(queueRef.current.filter((q) => q.tempId !== item.tempId));
        if (d.id && undoWantedRef.current.has(item.tempId)) {
          undoWantedRef.current.delete(item.tempId);
          void fetch("/api/collect", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: d.id, passcode }),
          }).catch(() => {});
        } else {
          setRecent((prev) => prev.map((p) => (p.clientId === item.tempId ? { ...p, id: d.id ?? p.id } : p)));
        }
      }
    } finally {
      inFlightRef.current = null;
      flushingRef.current = false;
    }
  }, [passcode, persistQueue]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (queueRef.current.length > 0) void flushQueue();
    }, 8_000);
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    // A restored queue (or a passcode typed after tags piled up) starts
    // sending without waiting for the next tap.
    if (queueRef.current.length > 0) void flushQueue();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [flushQueue]);

  const onPickPhoto = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto(await downscale(file));
    } catch {
      setStatus({ tone: "error", text: "Couldn't read that photo." });
    }
  }, []);

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
      setSettingsOpen(true);
      setStatus({ tone: "error", text: "You need to enter the passcode first." });
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
          photo: photo || undefined,
          collectedBy: collectedBy.trim() || undefined,
          passcode,
        }),
      });
      if (res.status === 401) {
        setSettingsOpen(true);
        setStatus({ tone: "error", text: "The passcode is incorrect." });
        return;
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ tone: "error", text: `Couldn't save (${d.error ?? res.status}).` });
        return;
      }
      const d = (await res.json()) as { id?: string; photo_url?: string | null };
      setRecent((prev) => [
        { id: d.id ?? `tmp-${prev.length}`, kind, note: note.trim(), photo: d.photo_url ?? null, lng, lat },
        ...prev,
      ]);
      setStatus({ tone: "ok", text: `${selected?.label ?? "Point"} added.` });
      setNote("");
      setPhoto(null);
    } catch {
      setStatus({ tone: "error", text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  }, [kind, note, photo, passcode, collectedBy, selected]);

  // ── Ride mode: one tap = one tag at the live fix ───────────────────
  const tagHere = useCallback(
    (t: (typeof TYPES)[number]) => {
      if (!passcode) {
        setSettingsOpen(true);
        setStatus({ tone: "error", text: "You need to enter the passcode first." });
        return;
      }
      const f = fixRef.current;
      if (!f || Date.now() - f.at > FIX_MAX_AGE_MS) {
        setStatus({ tone: "info", text: "Waiting for a GPS fix. Try again in a second." });
        return;
      }
      if (!isInFrederickCounty(f.lng, f.lat)) {
        setStatus({ tone: "error", text: "You're outside Frederick County." });
        return;
      }
      if (queueRef.current.length >= QUEUE_MAX) {
        setStatus({ tone: "error", text: "The send queue is full. Wait for a signal before tagging more." });
        return;
      }
      const tempId = newTempId();
      persistQueue([
        ...queueRef.current,
        { tempId, kind: t.kind, lng: f.lng, lat: f.lat, collectedBy: collectedBy.trim() || undefined },
      ]);
      setRecent((prev) => [
        { id: tempId, clientId: tempId, kind: t.kind, note: "", photo: null, lng: f.lng, lat: f.lat },
        ...prev,
      ]);
      setLastTag({ tempId, label: t.label });
      setStatus(null);
      // A short buzz confirms the tag without looking down (Android; iOS ignores it).
      navigator.vibrate?.(30);
      void flushQueue();
    },
    [passcode, collectedBy, persistQueue, flushQueue],
  );

  const undoLast = useCallback(async () => {
    const tag = lastTag;
    if (!tag) return;
    setLastTag(null);
    if (inFlightRef.current === tag.tempId) {
      undoWantedRef.current.add(tag.tempId);
      setRecent((prev) => prev.filter((p) => p.clientId !== tag.tempId));
      setStatus({ tone: "ok", text: "Removed." });
      return;
    }
    if (queueRef.current.some((q) => q.tempId === tag.tempId)) {
      persistQueue(queueRef.current.filter((q) => q.tempId !== tag.tempId));
      setRecent((prev) => prev.filter((p) => p.clientId !== tag.tempId));
      setStatus({ tone: "ok", text: "Removed." });
      return;
    }
    const point = recent.find((p) => p.clientId === tag.tempId);
    if (!point || isPendingId(point.id)) return;
    try {
      const res = await fetch("/api/collect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: point.id, passcode }),
      });
      if (!res.ok) {
        setStatus({ tone: "error", text: "Couldn't remove it. Tap the dot to delete it." });
        return;
      }
      setRecent((prev) => prev.filter((p) => p.clientId !== tag.tempId));
      setStatus({ tone: "ok", text: "Removed." });
    } catch {
      setStatus({ tone: "error", text: "Network error. Tap the dot to delete it." });
    }
  }, [lastTag, recent, passcode, persistQueue]);

  const startEdit = useCallback(
    (p: RecentPoint) => {
      if (isPendingId(p.id)) {
        setStatus({ tone: "info", text: "That one is still sending. Give it a moment." });
        return;
      }
      // Editing means the rider stopped; let the map hold still on the dot.
      followRef.current = false;
      setFollowing(false);
      setEditing(p);
      setKind(p.kind);
      setNote(p.note);
      setPhoto(null);
      setStatus(null);
      flyTo(p.lng, p.lat, 18);
    },
    [flyTo],
  );

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setNote("");
    setPhoto(null);
    setStatus(null);
  }, []);

  const switchMode = useCallback(
    (next: Mode) => {
      setMode(next);
      remember(MODE_KEY, next === "ride" ? "ride" : "");
      setLastTag(null);
      cancelEdit();
      if (next === "ride") {
        followRef.current = true;
        setFollowing(true);
      }
    },
    [cancelEdit],
  );

  const refollow = useCallback(() => {
    followRef.current = true;
    setFollowing(true);
    const f = fixRef.current;
    const map = mapRef.current?.getMap();
    if (f && map && isInFrederickCounty(f.lng, f.lat)) {
      map.easeTo({
        center: [f.lng, f.lat],
        zoom: Math.max(map.getZoom(), 16),
        duration: prefersReducedMotion() ? 0 : 700,
        easing: CAM_EASE,
        essential: true,
      });
    }
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    if (!passcode) {
      setSettingsOpen(true);
      setStatus({ tone: "error", text: "You need to enter the passcode first." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/collect", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, kind, note: note.trim(), photo: photo || undefined, passcode }),
      });
      if (res.status === 401) {
        setStatus({ tone: "error", text: "The passcode is incorrect." });
        return;
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ tone: "error", text: `Couldn't save (${d.error ?? res.status}).` });
        return;
      }
      setRecent((prev) =>
        prev.map((p) => (p.id === editing.id ? { ...p, kind, note: note.trim(), photo: photo || p.photo } : p)),
      );
      setStatus({ tone: "ok", text: "Updated." });
      cancelEdit();
    } catch {
      setStatus({ tone: "error", text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  }, [editing, kind, note, photo, passcode, cancelEdit]);

  const removePoint = useCallback(async () => {
    if (!editing) return;
    if (!passcode) {
      setSettingsOpen(true);
      setStatus({ tone: "error", text: "You need to enter the passcode first." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/collect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, passcode }),
      });
      if (res.status === 401) {
        setStatus({ tone: "error", text: "The passcode is incorrect." });
        return;
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ tone: "error", text: `Couldn't delete (${d.error ?? res.status}).` });
        return;
      }
      setRecent((prev) => prev.filter((p) => p.id !== editing.id));
      setStatus({ tone: "ok", text: "Removed." });
      cancelEdit();
    } catch {
      setStatus({ tone: "error", text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  }, [editing, passcode, cancelEdit]);

  const riding = mode === "ride";

  return (
    <main className="relative bg-[var(--app-bg)] text-[var(--app-ink)]" style={{ height: "100dvh" }}>
      <h1 className="sr-only">Collect civic amenities</h1>
      {/* Map fills the whole screen; the control bar floats over the bottom so
          the map stays as large as possible for accurate placement. */}
      <div className="absolute inset-0">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: FREDERICK[0], latitude: FREDERICK[1], zoom: 15 }}
          mapStyle={mapStyle}
          style={{ width: "100%", height: "100%" }}
          attributionControl={{ compact: true }}
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
          maxBounds={FREDERICK_MAX_BOUNDS_FLAT}
          minZoom={FREDERICK_MIN_ZOOM}
          maxZoom={FREDERICK_MAX_ZOOM}
          onDragStart={() => {
            // Dragging away means "let me look around": stop following until
            // the rider asks for it back.
            if (followRef.current) {
              followRef.current = false;
              setFollowing(false);
            }
          }}
          onZoomStart={() => {
            // A pinch shouldn't fight the follow camera; pause it briefly
            // instead of turning following off.
            gestureUntilRef.current = Date.now() + 1600;
          }}
          reuseMaps
        >
          {userPos && (
            <Marker longitude={userPos.lng} latitude={userPos.lat} anchor="center">
              <span className="block h-4 w-4 rounded-full border-2 border-white bg-[var(--app-cool)] shadow-[0_0_0_4px_rgba(32,80,106,0.25)]" />
            </Marker>
          )}
          {recent.map((p) => {
            const active = editing?.id === p.id;
            const pending = isPendingId(p.id);
            return (
              <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(p);
                  }}
                  aria-label={`Edit ${p.kind}`}
                  className="grid place-items-center"
                  style={{ width: 34, height: 34 }}
                >
                  <span
                    className="block rounded-full border-2 border-white shadow"
                    style={{
                      width: active ? 18 : 14,
                      height: active ? 18 : 14,
                      background: COLOR_FOR(p.kind),
                      // A half-strength dot is the "still sending" state.
                      opacity: pending ? 0.55 : 1,
                      outline: active ? "2px solid var(--app-ink)" : "none",
                      outlineOffset: 1,
                    }}
                  />
                </button>
              </Marker>
            );
          })}
        </Map>
      </div>

      {/* Center crosshair — at the map's geometric center, which is exactly
          where getCenter() (the drop point) reads. The bottom control card
          floats below it. Aim mode only; ride mode drops at the GPS dot. */}
      {!riding && !editing && (
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
      )}

      {/* Floating data chip: marked count, plus live fix quality and the
          send queue while riding (info only). */}
      <div className="absolute left-3 top-3 rounded-full bg-[var(--app-ink)]/85 px-3 py-1.5 font-mono text-xs text-white shadow">
        {recent.length} marked
        {riding && fix ? ` · ±${Math.max(1, Math.round(fix.accuracy))} m` : ""}
        {queued.length > 0 ? ` · ${queued.length} sending` : ""}
      </div>

      {/* Mode switch. Aim = crosshair placement while standing; Ride = one-tap
          tags at the live GPS fix while moving. */}
      <div
        className="absolute right-3 top-3 flex rounded-full border border-[var(--app-ink)]/10 bg-white p-0.5 shadow"
        role="group"
        aria-label="Collect mode"
      >
        {([
          { m: "aim" as const, label: "Aim" },
          { m: "ride" as const, label: "Ride" },
        ]).map(({ m, label }) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            aria-pressed={mode === m}
            className={`tap-44 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              mode === m ? "bg-[var(--app-brand-tint-14)] text-[var(--app-ink)]" : "text-[var(--app-ink)]/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Floating control card pinned to the bottom. */}
      <div
        className="absolute inset-x-0 bottom-0 space-y-2.5 rounded-t-[var(--app-radius-lg,18px)] border-t border-[var(--app-ink)]/10 bg-[var(--app-bg)]/97 p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.6rem)] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur"
      >
        {editing ? (
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Editing a marked spot</p>
            <button type="button" onClick={cancelEdit} className="tap-44 text-sm text-[var(--app-ink)]/60">Cancel</button>
          </div>
        ) : riding ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] leading-tight text-[var(--app-ink)]/70">
              {geoBlocked
                ? "Location is blocked. Allow location for this site to tag while riding."
                : fix
                  ? "Tap a type to tag it right where you are."
                  : "The map is waiting for a GPS fix."}
            </p>
            {!following && (
              <button
                type="button"
                onClick={refollow}
                className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--app-ink)]"
              >
                Recenter
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => locate(true)}
              className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--app-ink)]"
              aria-label="Use my location"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={locating ? "animate-spin" : undefined}>
                <circle cx="12" cy="12" r="7" />
                <line x1="12" y1="1" x2="12" y2="4" />
                <line x1="12" y1="20" x2="12" y2="23" />
                <line x1="1" y1="12" x2="4" y2="12" />
                <line x1="20" y1="12" x2="23" y2="12" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
              </svg>
              {locating ? "Locating…" : "My location"}
            </button>
            <p className="text-[11px] leading-tight text-[var(--app-ink)]/55">
              {geoBlocked
                ? "Location blocked. Drag the map so the crosshair sits on the spot."
                : "Center the crosshair on the spot, pick a type, Add. Tap a dot to edit."}
            </p>
          </div>
        )}

        {riding && !editing ? (
          /* Ride picker: every button IS the save. Bigger targets than the
             aim row because the phone is on a moving handlebar mount. */
          <div className="grid grid-cols-5 gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.kind}
                type="button"
                onClick={() => tagHere(t)}
                aria-label={`Tag ${t.label} at my location`}
                className="flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/12 bg-white/80 px-1 py-2 text-center transition-transform active:scale-95"
              >
                <t.Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                <span className="text-[10px] font-medium leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        ) : (
          /* Aim/edit picker — single horizontal row (saves vertical space). */
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" style={{ scrollbarWidth: "none" }}>
            {TYPES.map((t) => {
              const active = t.kind === kind;
              return (
                <button
                  key={t.kind}
                  type="button"
                  onClick={() => setKind(t.kind)}
                  aria-pressed={active}
                  className={`flex min-h-[52px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[var(--app-radius-md,12px)] border px-1 py-1.5 text-center transition-colors ${
                    active
                      ? "border-[var(--app-brand,#B5462B)] bg-[var(--app-brand-tint-14)]"
                      : "border-[var(--app-ink)]/12 bg-white/70"
                  }`}
                >
                  <t.Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                  <span className="text-[9.5px] font-medium leading-tight">{t.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {riding && !editing && lastTag && (
          <div className="flex items-center justify-between rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/10 bg-white/80 px-3 py-1.5">
            <p className="text-sm">{lastTag.label} is tagged.</p>
            <button
              type="button"
              onClick={undoLast}
              className="tap-44 text-sm font-semibold text-[var(--app-brand,#B5462B)]"
            >
              Undo
            </button>
          </div>
        )}

        {/* Note + photo on one row. Ride mode skips both at capture time
            (speed first); stop and tap a dot to add them afterward. */}
        {(!riding || editing) && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={280}
              aria-label="Note"
              placeholder={kind === "other" ? "What is it?" : "Note (optional)"}
              className="min-h-11 min-w-0 flex-1 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--app-brand,#B5462B)]"
            />
            {/* Visible "Photo" text (not an emoji alone): the camera glyph fails
                to render on some Android/desktop fonts, collapsing the control to
                a blank box — the "no photo button" report. The word label keeps
                it visible + recognizable everywhere, matching every other control
                in this tool (glyph + label). aria-label names it for AT. */}
            <label
              aria-label="Add photo"
              className="tap-44 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2.5 text-sm font-medium"
            >
              <span aria-hidden="true">{"\u{1F4F7}"}</span>
              <span>{photo || editing?.photo ? "Change" : "Photo"}</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPickPhoto(e.target.files?.[0])} />
            </label>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- local capture preview (data URL)
              <img src={photo} alt="Preview" className="h-10 w-10 shrink-0 rounded-md object-cover" />
            ) : editing?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- existing reference photo
              <img src={editing.photo} alt="Current" className="h-10 w-10 shrink-0 rounded-md object-cover opacity-80" />
            ) : null}
          </div>
        )}

        {/* Passcode + name behind a disclosure (set once). */}
        <button
          type="button"
          onClick={() => setSettingsOpen((s) => !s)}
          className="tap-44 text-[11px] font-medium text-[var(--app-ink)]/55"
        >
          {settingsOpen ? "Hide passcode" : passcode ? "Passcode set · change" : "Enter passcode"}
        </button>
        {settingsOpen && (
          <div className="flex gap-2">
            <input
              type="password"
              aria-label="Trusted passcode"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                remember(PASS_KEY, e.target.value);
              }}
              placeholder="Passcode"
              autoComplete="off"
              className="min-h-11 w-1/2 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--app-brand,#B5462B)]"
            />
            <input
              type="text"
              aria-label="Your name"
              value={collectedBy}
              onChange={(e) => {
                setCollectedBy(e.target.value);
                remember(BY_KEY, e.target.value);
              }}
              maxLength={60}
              placeholder="Your name (optional)"
              className="min-h-11 w-1/2 rounded-[var(--app-radius-md,12px)] border border-[var(--app-ink)]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--app-brand,#B5462B)]"
            />
          </div>
        )}

        {status && (
          <p
            className={`text-center text-sm ${
              status.tone === "ok"
                ? "text-[var(--app-positive,#315A43)]"
                : status.tone === "error"
                  ? "text-[var(--app-brand,#B5462B)]"
                  : "text-[var(--app-ink)]/70"
            }`}
            role="status"
          >
            {status.text}
          </p>
        )}

        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={removePoint}
              disabled={saving}
              className="rounded-[var(--app-radius-md,12px)] border border-[var(--app-brand,#B5462B)] px-4 py-3 text-base font-semibold text-[var(--app-brand,#B5462B)] disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="flex-1 rounded-[var(--app-radius-md,12px)] bg-[var(--app-brand-press)] py-3 text-base font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        ) : riding ? null : (
          <button
            type="button"
            onClick={add}
            disabled={saving}
            className="w-full rounded-[var(--app-radius-md,12px)] bg-[var(--app-brand-press)] py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Adding…" : `Add ${selected?.label ?? "point"} here`}
          </button>
        )}
      </div>
    </main>
  );
}
