"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, Loader2, X } from "lucide-react";
import { REPORT_CATEGORIES, REPORT_CATEGORY_BY_KEY } from "@/lib/reports/categories";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";

/**
 * MarkSheet — mark a spot ON the map, no navigate-away (MAP_AUDIT Slice 3).
 *
 * The FAB used to link out to /report, a separate full-screen tool — marking
 * meant leaving the map you were just looking at. Now the FAB enters MARK
 * MODE: a crosshair holds the map's center (the same center-crosshair pattern
 * /report uses — pan the map UNDER the pin, so there's no tap-vs-pan gesture
 * fight), and this light sheet floats at the bottom with category chips, an
 * optional note, and Submit. The map stays fully pannable the whole time:
 * this is a plain positioned card, deliberately NOT a modal drawer with an
 * overlay.
 *
 * The submit contract is /api/reports, unchanged — including the hazard
 * photo gate (photoRequired) and the server's spam checks. /report remains
 * the full tool (passcode, collected-by) and is linked from the sheet.
 */

type Status = { tone: "ok" | "error"; text: string } | null;

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

export default function MarkSheet({
  getCenter,
  inCounty,
  onClose,
  onPlaced,
}: {
  /** Read the map's CURRENT center at submit time (the crosshair spot). */
  getCenter: () => { lng: number; lat: number } | null;
  /** County guard, evaluated at submit against the actual center. */
  inCounty: (lng: number, lat: number) => boolean;
  onClose: () => void;
  /** Success: the parent drops an optimistic marker at the spot. */
  onPlaced: (spot: { lng: number; lat: number; category: string; queued: boolean }) => void;
}) {
  const [category, setCategory] = useState("tip");
  const [subtype, setSubtype] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const def = REPORT_CATEGORY_BY_KEY[category];

  async function onPickPhoto(f: File | undefined) {
    if (!f) return;
    try {
      setPhoto(await downscale(f));
      setStatus(null);
    } catch {
      setStatus({ tone: "error", text: "Couldn't read that photo." });
    }
  }

  async function submit() {
    if (saving) return;
    const c = getCenter();
    if (!c) return;
    if (!inCounty(c.lng, c.lat)) {
      setStatus({ tone: "error", text: "That spot is outside Frederick County." });
      return;
    }
    if (def?.photoRequired && !photo) {
      setStatus({ tone: "error", text: "A photo is required for a hazard." });
      return;
    }
    if (!note.trim() && !subtype) {
      setStatus({ tone: "error", text: "Pick a type or add a few words." });
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
          subtype: subtype || undefined,
          note: note.trim() || undefined,
          photo: photo || undefined,
          lng: c.lng,
          lat: c.lat,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        const msg =
          d.error === "photo-required" ? "A photo is required for a hazard."
          : d.error === "need-text" ? "Add a few words about it."
          : d.error?.startsWith("rejected-") ? "That text looks like spam. Try plain words, no links."
          : d.error === "out-of-bounds" ? "That spot is outside Frederick County."
          : "Couldn't send that. Try again.";
        setStatus({ tone: "error", text: msg });
        return;
      }
      const d = (await res.json()) as { queued?: boolean };
      track("report_submit", { category, queued: Boolean(d.queued), source: "map" });
      haptic("medium");
      onPlaced({ lng: c.lng, lat: c.lat, category, queued: Boolean(d.queued) });
    } catch {
      setStatus({ tone: "error", text: "Network error. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="pointer-events-auto rounded-[var(--app-radius-lg)] border p-3.5"
      style={{
        borderColor: "var(--app-border)",
        background: "color-mix(in srgb, var(--app-bg-elevated-solid) 94%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "var(--app-elev-3), var(--app-edge), var(--app-hi)",
      }}
      role="dialog"
      aria-label="Mark this spot"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-serif text-[16px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            Mark this spot
          </p>
          <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            Pan the map to put the crosshair on it.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel marking"
          className="tap-44 -mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-full"
          style={{ color: "var(--app-ink-3)" }}
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      {/* Category chips — verb-free labels straight from the shared defs. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="What kind of mark">
        {REPORT_CATEGORIES.map((cdef) => {
          const on = category === cdef.key;
          return (
            <button
              key={cdef.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => { setCategory(cdef.key); setSubtype(null); haptic("light"); }}
              className="tap-44-y inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[12.5px] font-semibold transition active:scale-[0.96]"
              style={{
                borderColor: on ? "var(--app-brand)" : "var(--app-border)",
                background: on ? "color-mix(in srgb, var(--app-brand) 12%, transparent)" : "transparent",
                color: on ? "var(--app-brand-press)" : "var(--app-ink-2)",
              }}
            >
              <span aria-hidden>{cdef.glyph}</span>
              {cdef.label}
            </button>
          );
        })}
      </div>
      {def && def.subtypes.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${def.label} type`}>
          {def.subtypes.map((s) => {
            const on = subtype === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => { setSubtype(on ? null : s.key); haptic("light"); }}
                className="tap-44-y inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11.5px] font-medium transition active:scale-[0.96]"
                style={{
                  borderColor: on ? "var(--app-ink-2)" : "var(--app-border)",
                  color: on ? "var(--app-ink)" : "var(--app-ink-3)",
                }}
              >
                <span aria-hidden>{s.glyph}</span>
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A few words (what is it?)"
          maxLength={280}
          aria-label="Note"
          className="min-w-0 flex-1 rounded-[var(--app-radius-md)] border px-3 py-2 text-[14px] focus:outline-none"
          style={{
            borderColor: "var(--app-border-strong)",
            background: "var(--app-bg-elevated-solid)",
            color: "var(--app-ink)",
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={def?.photoRequired ? "Add photo (required for hazards)" : "Add photo (optional)"}
          className="tap-44 grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-md)] border"
          style={{
            borderColor: photo ? "var(--app-brand-2)" : "var(--app-border)",
            color: photo ? "var(--app-brand-2)" : "var(--app-ink-3)",
          }}
        >
          <Camera className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPickPhoto(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-[var(--app-radius-md)] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--app-brand)" }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Mark it
        </button>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2" aria-live="polite">
        <p className="text-[11.5px]" style={{ color: status?.tone === "error" ? "var(--app-brand-press)" : "var(--app-ink-3)" }}>
          {status?.text ?? (def?.photoRequired ? "Hazards need a photo." : "Goes to the county map after a quick review.")}
        </p>
        <Link href="/report" className="shrink-0 text-[11.5px] font-semibold underline" style={{ color: "var(--app-ink-3)" }}>
          Full tool
        </Link>
      </div>
    </div>
  );
}
