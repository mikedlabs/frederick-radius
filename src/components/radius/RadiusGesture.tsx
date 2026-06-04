"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { MapPin, MoveHorizontal } from "lucide-react";

/**
 * RadiusGesture — the signature interaction prototype. A literal radius
 * dragged out from where you stand; the map + the guide repopulate LIVE
 * by real distance as it grows and shrinks. The name becomes the mechanic.
 *
 * Non-glass atlas language (paper + ink, no backdrop-blur). The ring's
 * motion is the only animation, and it explains one thing: reach.
 */

export type RadiusPlace = { name: string; category: string; color: string; mi: number };

const MAXMI = 22;
const miToFrac = (mi: number) => Math.sqrt(Math.min(mi, MAXMI)) / Math.sqrt(MAXMI);
const fracToMi = (f: number) => f * f * MAXMI;
const fmtMi = (m: number) => (m < 10 ? m.toFixed(1) : String(Math.round(m))) + " mi";

export default function RadiusGesture({ places, aerialSrc }: { places: RadiusPlace[]; aerialSrc: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rFrac, setRFrac] = useState(0.4);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cx = size.w * 0.5;
  const cy = size.h * 0.46;
  const maxR = Math.min(size.w, size.h) * 0.46;
  const R = rFrac * maxR;
  const miles = fracToMi(rFrac);
  const minutes = Math.max(1, Math.round(miles * 20));

  const items = places.map((p, i) => {
    const frac = miToFrac(p.mi);
    const angle = i * 2.39996; // golden angle, radians — even, non-overlapping spread
    const rpx = frac * maxR;
    return { ...p, frac, x: cx + rpx * Math.cos(angle), y: cy + rpx * Math.sin(angle), inside: frac <= rFrac };
  });
  const inside = items.filter((it) => it.inside).sort((a, b) => a.mi - b.mi);

  const onMove = (e: ReactPointerEvent) => {
    if (!dragging) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dist = Math.hypot(e.clientX - rect.left - cx, e.clientY - rect.top - cy);
    setRFrac(Math.max(0.12, Math.min(1, dist / maxR)));
  };

  const ringTransition = dragging ? "none" : "left .28s cubic-bezier(.22,1,.36,1), top .28s cubic-bezier(.22,1,.36,1), width .28s cubic-bezier(.22,1,.36,1), height .28s cubic-bezier(.22,1,.36,1)";

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "var(--app-bg)" }}>
      {/* header */}
      <div className="px-5 pb-3 pt-12">
        <p className="text-[10.5px] font-bold uppercase" style={{ letterSpacing: "0.2em", color: "var(--app-ink-3)" }}>
          The Radius · Downtown Frederick
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.01em]" style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--app-ink)" }}>
          How far will you go?
        </h1>
      </div>

      {/* MAP AREA */}
      <div ref={ref} className="relative flex-1 overflow-hidden" style={{ touchAction: "none" }}>
        <Image src={aerialSrc} alt="" fill sizes="100vw" className="object-cover" aria-hidden />
        <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(120% 92% at 50% 46%, rgba(20,18,14,0.12), rgba(20,18,14,0.68))" }} />

        {size.w > 0 && (
          <>
            {/* coverage ring */}
            <div
              aria-hidden
              className="absolute rounded-full"
              style={{
                left: cx - R,
                top: cy - R,
                width: 2 * R,
                height: 2 * R,
                border: "2px solid color-mix(in srgb, var(--app-accent) 92%, white)",
                background: "radial-gradient(circle, color-mix(in srgb, var(--app-accent) 20%, transparent), color-mix(in srgb, var(--app-accent) 6%, transparent) 68%, transparent)",
                transition: ringTransition,
              }}
            />

            {/* place dots */}
            {items.map((it) => (
              <div key={it.name} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: it.x, top: it.y }}>
                <span
                  className="block rounded-full"
                  style={{
                    width: it.inside ? 15 : 9,
                    height: it.inside ? 15 : 9,
                    background: it.inside ? it.color : "rgba(255,255,255,0.55)",
                    boxShadow: it.inside
                      ? `0 0 0 3px color-mix(in srgb, ${it.color} 32%, transparent), 0 2px 7px rgba(0,0,0,0.55)`
                      : "0 1px 3px rgba(0,0,0,0.5)",
                    transition: dragging ? "none" : "width .2s, height .2s, background .2s",
                  }}
                />
                {it.inside && (
                  <span
                    className="absolute left-1/2 top-[calc(100%+4px)] -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
                    style={{ background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}
                  >
                    {it.name.split(" ").slice(0, 2).join(" ")}
                  </span>
                )}
              </div>
            ))}

            {/* you */}
            <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: cx, top: cy }}>
              <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: "var(--app-brand)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--app-brand) 26%, transparent), 0 2px 8px rgba(0,0,0,0.55)" }}>
                <span className="block h-2 w-2 rounded-full bg-white" />
              </span>
            </div>

            {/* drag knob */}
            <div
              role="slider"
              aria-label="Drag to set your radius"
              aria-valuemin={0}
              aria-valuemax={MAXMI}
              aria-valuenow={Math.round(miles * 10) / 10}
              tabIndex={0}
              onPointerDown={(e) => {
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* setPointerCapture can throw for synthetic/inactive pointers */
                }
                setDragging(true);
              }}
              onPointerMove={onMove}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing"
              style={{ left: cx + R, top: cy, transition: dragging ? "none" : "left .28s cubic-bezier(.22,1,.36,1)" }}
            >
              <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "0 3px 12px rgba(0,0,0,0.45), 0 0 0 2px color-mix(in srgb, var(--app-accent) 85%, white)" }}>
                <MoveHorizontal className="h-5 w-5" strokeWidth={2.25} style={{ color: "var(--app-ink-2)" }} aria-hidden />
              </span>
            </div>

            {/* live readout — paper, not glass */}
            <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-2xl px-5 py-2.5 text-center" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "0 8px 24px -8px rgba(0,0,0,0.45)" }}>
              <p className="leading-none" style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--app-ink)" }}>
                <span className="text-[30px] font-semibold tabular-nums">{inside.length}</span>{" "}
                <span className="text-[13px] font-medium" style={{ color: "var(--app-ink-3)" }}>places</span>
              </p>
              <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--app-ink-2)" }}>
                within {fmtMi(miles)}{miles < 4 ? ` · ~${minutes} min walk` : ""}
              </p>
            </div>
          </>
        )}
      </div>

      {/* live guide — repopulates by distance as the ring moves */}
      <div className="shrink-0 px-4 pb-8 pt-3" style={{ background: "var(--app-bg)" }}>
        <p className="mb-2 px-1 text-[11px] font-bold uppercase" style={{ letterSpacing: "0.18em", color: "var(--app-ink-3)" }}>
          Within your radius
        </p>
        <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {inside.map((it) => (
            <div
              key={it.name}
              className="flex w-[150px] shrink-0 flex-col gap-1 rounded-2xl border p-3"
              style={{ background: "var(--app-bg-elevated-solid)", borderColor: "var(--app-border)", boxShadow: "0 1px 2px rgba(26,24,21,0.05), 0 10px 24px -16px rgba(26,24,21,0.3)" }}
            >
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: it.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.color }} aria-hidden />
                {it.category}
              </span>
              <span className="truncate text-[14px] font-semibold tracking-[-0.01em]" style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--app-ink)" }}>
                {it.name}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
                {fmtMi(it.mi)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
