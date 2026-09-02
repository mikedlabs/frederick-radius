"use client";

import { Check, LocateFixed, MapPin, Navigation, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import {
  cardinalDirectionToCar,
  clearSavedFairCar,
  createSavedFairCar,
  FAIR_CAR_STORAGE_KEY,
  fairCarGpsQuality,
  parseSavedFairCar,
  straightLineDistanceMeters,
  writeSavedFairCar,
  type SavedFairCar,
} from "@/lib/fair/car-memory";

const LOTS = [
  { id: "unsure", label: "I am not sure which lot" },
  { id: "lot-infield", label: "Gate 3 / Infield" },
  { id: "lot-a", label: "Lot A" },
  { id: "lot-b", label: "Lot B" },
  { id: "lot-c", label: "Lot C" },
  { id: "lot-d", label: "Lot D" },
] as const;

type LotId = (typeof LOTS)[number]["id"];
type CurrentGuidance = { distanceMeters: number; direction: string } | null;
const FAIR_CAR_CHANGE_EVENT = "fr-fair-car-change";

function subscribeToFairCar(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(FAIR_CAR_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(FAIR_CAR_CHANGE_EVENT, onStoreChange);
  };
}

function fairCarSnapshot(): string | null {
  try {
    return window.localStorage.getItem(FAIR_CAR_STORAGE_KEY);
  } catch {
    return null;
  }
}

function serverFairCarSnapshot(): null {
  return null;
}

function announceFairCarChange(): void {
  window.dispatchEvent(new Event(FAIR_CAR_CHANGE_EVENT));
}

function distanceLabel(distanceMeters: number): string {
  if (distanceMeters < 1_000) return `${Math.max(1, Math.round(distanceMeters))} m`;
  return `${(distanceMeters / 1_609.344).toFixed(1)} mi`;
}

function savedTimeLabel(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function directionLabel(direction: string): string {
  return ({
    N: "north",
    NE: "northeast",
    E: "east",
    SE: "southeast",
    S: "south",
    SW: "southwest",
    W: "west",
    NW: "northwest",
  } as Record<string, string>)[direction] ?? direction;
}

function geolocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location access was not allowed. You can still save the lot and a short note.";
  }
  if (error.code === error.TIMEOUT) {
    return "Your location took too long to load. Try again or save the lot and note only.";
  }
  return "Your location is not available right now. Save the lot and a short note instead.";
}

export default function FairCarMemoryPanel({ enabled = true }: { enabled?: boolean }) {
  const [lotId, setLotId] = useState<LotId>("unsure");
  const [note, setNote] = useState("");
  const [sessionSaved, setSessionSaved] = useState<SavedFairCar | null>(null);
  const [pendingWeak, setPendingWeak] = useState<SavedFairCar | null>(null);
  const [guidance, setGuidance] = useState<CurrentGuidance>(null);
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [locatingReturn, setLocatingReturn] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const savedResultRef = useRef<HTMLDivElement>(null);
  const guidanceRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const storedRaw = useSyncExternalStore(
    subscribeToFairCar,
    fairCarSnapshot,
    serverFairCarSnapshot,
  );
  const storedSaved = parseSavedFairCar(storedRaw);
  const saved = storedSaved ?? sessionSaved;

  useEffect(() => {
    if (!storedRaw) return;
    const current = parseSavedFairCar(storedRaw);
    if (!current) {
      clearSavedFairCar(window.localStorage);
      announceFairCarChange();
      return;
    }
    const timeout = window.setTimeout(() => {
      clearSavedFairCar(window.localStorage);
      announceFairCarChange();
      setSessionSaved(null);
      setGuidance(null);
      setMessage("The saved parking spot expired and was removed from this device.");
      window.requestAnimationFrame(() => panelRef.current?.focus());
    }, Math.max(0, Date.parse(current.expiresAt) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [storedRaw]);

  useEffect(() => {
    if (!sessionSaved) return;
    const timeout = window.setTimeout(() => {
      setSessionSaved(null);
      setGuidance(null);
      setMessage("The page-only parking spot expired after 18 hours.");
      window.requestAnimationFrame(() => panelRef.current?.focus());
    }, Math.max(0, Date.parse(sessionSaved.expiresAt) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [sessionSaved]);

  const lotLabel = LOTS.find((lot) => lot.id === lotId)?.label ?? null;

  function keep(savedCar: SavedFairCar, successMessage: string) {
    const persisted = writeSavedFairCar(window.localStorage, savedCar);
    setSessionSaved(persisted ? null : savedCar);
    if (persisted) announceFairCarChange();
    setPendingWeak(null);
    setGuidance(null);
    setMessage(
      persisted
        ? successMessage
        : "Your browser could not store this. Keep this page open if you need the note later.",
    );
    window.requestAnimationFrame(() => savedResultRef.current?.focus());
  }

  function saveFallback() {
    try {
      const savedCar = createSavedFairCar({ lotId, lotLabel, note });
      keep(savedCar, "Your lot and note are saved on this device for up to 18 hours.");
    } catch {
      setMessage("The Fair car-memory window is not available for this date.");
      window.requestAnimationFrame(() => messageRef.current?.focus());
    }
  }

  function savePreciseLocation() {
    if (!("geolocation" in navigator)) {
      setMessage("This device cannot provide a location. Save the lot and note instead.");
      window.requestAnimationFrame(() => messageRef.current?.focus());
      return;
    }
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        try {
          const candidate = createSavedFairCar({
            lotId,
            lotLabel,
            note,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          });
          if (fairCarGpsQuality(candidate) === "weak") {
            setPendingWeak(candidate);
            setMessage(
              `This location is only accurate to about ${Math.round(position.coords.accuracy)} metres. Confirm it or save the lot and note only.`,
            );
            window.requestAnimationFrame(() => messageRef.current?.focus());
            return;
          }
          keep(candidate, "Your car location is saved only on this device for up to 18 hours.");
        } catch {
          setMessage("The Fair car-memory window is not available for this date.");
          window.requestAnimationFrame(() => messageRef.current?.focus());
        }
      },
      (error) => {
        setLocating(false);
        setMessage(geolocationErrorMessage(error));
        window.requestAnimationFrame(() => messageRef.current?.focus());
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 },
    );
  }

  function findDirection() {
    if (
      !saved ||
      saved.latitude === null ||
      saved.longitude === null ||
      !("geolocation" in navigator)
    ) {
      setMessage("A saved location is needed before Radius can show local return guidance.");
      window.requestAnimationFrame(() => messageRef.current?.focus());
      return;
    }
    setLocatingReturn(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocatingReturn(false);
        const from = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const to = { latitude: saved.latitude!, longitude: saved.longitude! };
        setGuidance({
          distanceMeters: straightLineDistanceMeters(from, to),
          direction: cardinalDirectionToCar(from, to),
        });
        setMessage("");
        window.requestAnimationFrame(() => guidanceRef.current?.focus());
      },
      (error) => {
        setLocatingReturn(false);
        setMessage(geolocationErrorMessage(error));
        window.requestAnimationFrame(() => messageRef.current?.focus());
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 },
    );
  }

  function clear() {
    clearSavedFairCar(window.localStorage);
    announceFairCarChange();
    setSessionSaved(null);
    setPendingWeak(null);
    setGuidance(null);
    setNote("");
    setLotId("unsure");
    setMessage("The saved car location and note were removed from this device.");
    window.requestAnimationFrame(() => panelRef.current?.focus());
  }

  return (
    <div
      id="fair-car-memory"
      ref={panelRef}
      tabIndex={-1}
      className="mt-5 border px-4 py-5 sm:px-5"
      style={{
        borderColor: "var(--app-border-strong)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--app-cool)" }}
          >
            Device-only car memory
          </p>
          <h3 className="mt-1 text-[19px] font-bold leading-tight tracking-[-0.025em]">
            Save where you parked.
          </h3>
        </div>
        <MapPin className="h-6 w-6 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
      </div>
      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        Radius never sends this location, lot, or note to its servers, analytics, the NAS, or a map provider. It is deleted from this device within 18 hours.
      </p>

      {saved ? (
        <div ref={savedResultRef} tabIndex={-1} className="mt-4 outline-none" role="status" aria-live="polite">
          <div className="border-l-2 pl-4" style={{ borderColor: "var(--app-cool)" }}>
            <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              <Check className="h-4 w-4" style={{ color: "var(--app-cool)" }} aria-hidden />
              {saved.lotLabel ?? "Parking spot saved"}
            </p>
            {saved.note ? (
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {saved.note}
              </p>
            ) : null}
            <p className="mt-1 text-[10.5px] font-medium tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              Saved {savedTimeLabel(saved.savedAt)}. {saved.latitude === null ? "Lot and note only." : `Location accuracy about ${Math.round(saved.accuracyMeters ?? 0)} metres.`}
            </p>
          </div>

          {saved.latitude !== null ? (
            <div className="mt-4">
              <Button
                className="w-full sm:w-auto"
                variant="secondary"
                loading={locatingReturn}
                onClick={findDirection}
                iconLeft={<Navigation className="h-4 w-4" aria-hidden />}
              >
                Where is my car from here?
              </Button>
              {guidance ? (
                <div
                  ref={guidanceRef}
                  tabIndex={-1}
                  className="mt-3 border-l-2 pl-4 outline-none"
                  style={{ borderColor: "var(--app-brand-press)" }}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <p className="text-[19px] font-bold tabular-nums" style={{ color: "var(--app-ink)" }}>
                    About {distanceLabel(guidance.distanceMeters)} {directionLabel(guidance.direction)}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                    This is a straight-line direction calculated on your device. It is not a verified walking route. Follow on-site signs and barriers.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              The lot and note remain useful if location access is unavailable.
            </p>
          )}

          <Button
            className="mt-3"
            variant="quiet"
            onClick={clear}
            iconLeft={<Trash2 className="h-4 w-4" aria-hidden />}
          >
            Delete saved spot
          </Button>
        </div>
      ) : !enabled ? (
        <div className="mt-4 border-l-2 py-1 pl-4" style={{ borderColor: "var(--app-cool)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Use this after you park.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            On a Fair day, Radius can save your parking lot, a short landmark note, or your device location. The tool stays off until the Fair begins.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
                Parking lot
              </span>
              <select
                value={lotId}
                onChange={(event) => setLotId(event.target.value as LotId)}
                className="mt-1 h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] px-3 text-[13px] outline-none focus:border-[var(--app-cool)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--app-cool)_20%,transparent)]"
                style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}
              >
                {LOTS.map((lot) => (
                  <option key={lot.id} value={lot.id}>{lot.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
                Short note
              </span>
              <input
                value={note}
                maxLength={120}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Example: blue row by light pole"
                className="mt-1 h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] px-3 text-[13px] outline-none placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-cool)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--app-cool)_20%,transparent)]"
                style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button
              className="w-full"
              loading={locating}
              onClick={savePreciseLocation}
              iconLeft={<LocateFixed className="h-4 w-4" aria-hidden />}
              style={{ backgroundColor: "var(--app-cool)" }}
            >
              Save my location
            </Button>
            <Button className="w-full" variant="secondary" onClick={saveFallback}>
              Save lot and note only
            </Button>
          </div>

          {pendingWeak ? (
            <div
              className="mt-4 border-l-2 pl-4"
              style={{ borderColor: "var(--app-warning-press)" }}
            >
              <p className="flex items-start gap-2 text-[12px] font-semibold leading-relaxed" style={{ color: "var(--app-ink)" }}>
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-warning-press)" }} aria-hidden />
                The GPS point may be too broad to identify the correct row.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => keep(pendingWeak, "The approximate car location is saved only on this device for up to 18 hours.")}>
                  Save approximate spot
                </Button>
                <Button size="sm" variant="quiet" onClick={saveFallback}>
                  Use lot and note only
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {message ? (
        <p ref={messageRef} tabIndex={-1} className="mt-3 text-[11.5px] leading-relaxed outline-none" style={{ color: "var(--app-ink-2)" }} role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <p className="mt-4 flex items-start gap-2 text-[10.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Location is requested only when you tap a location button. Nothing here is included in Radius event analytics.
      </p>
    </div>
  );
}
