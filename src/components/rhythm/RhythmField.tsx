"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SLOTS_PER_DAY, WEEK_SLOTS, slotLabel, type RhythmPlace, type RhythmGroup } from "@/lib/rhythm";

/**
 * RhythmField — the county as a board of ~1,200 lights, one per place,
 * scrubbed through the 672 quarter-hours of a week.
 *
 * Deliberately NOT a chart (owner taste, Jul 2026): the data is rendered
 * as the thing it describes - doors, on or off. Dots sit in category
 * bands so each trade's wake/sleep wave is visible as a band of color
 * sweeping on. A canvas repaint per scrub frame is one bit-test per
 * place, cheap enough for butter on a phone.
 *
 * Interactions: drag the week slider (or tap a story chip to jump the
 * dial to a hidden trend), tap any light to name it. "Now" returns to
 * the live minute. All state is visual; nothing here claims more than
 * posted hours claim.
 */

const GROUP_META: Record<RhythmGroup, { label: string; varName: string; fallback: string }> = {
  food: { label: "Kitchens", varName: "--app-brand", fallback: "#E14328" },
  coffee: { label: "Coffee", varName: "--app-accent-press", fallback: "#8B6F4E" },
  pours: { label: "Pours", varName: "--app-accent", fallback: "#C9A227" },
  shops: { label: "Shops", varName: "--app-warning", fallback: "#B8860B" },
  outdoors: { label: "Outdoors", varName: "--app-brand-2", fallback: "#16352B" },
  wellness: { label: "Wellness", varName: "--app-cool", fallback: "#3D6B8E" },
  services: { label: "Services", varName: "--app-ink-2", fallback: "#4A463C" },
  civic: { label: "Civic & culture", varName: "--app-ink-3", fallback: "#7A7466" },
  lodging: { label: "Stays", varName: "--app-positive", fallback: "#2E7D4F" },
};

type Story = { key: string; label: string; slot: number; line: (counts: number[]) => string };

const atSlot = (day: number, h: number, m = 0) => day * SLOTS_PER_DAY + h * 4 + Math.floor(m / 15);

const buildStories = (peak: { slot: number; count: number }): Story[] => [
  {
    key: "peak",
    label: "The peak minute",
    slot: peak.slot,
    line: () => `The week tops out here: ${peak.count} doors open at ${slotLabel(peak.slot)}. Saturday never catches a weekday lunch.`,
  },
  {
    key: "monday",
    label: "The secret Sunday",
    slot: atSlot(0, 12),
    line: (c) => `Monday is the county's real day off: ${c[atSlot(4, 12)] - c[atSlot(0, 12)]} fewer doors than the same hour Friday, and a third of the kitchens are dark.`,
  },
  {
    key: "noonflip",
    label: "The noon flip",
    slot: atSlot(5, 11, 45),
    line: () => "11:45 on a Saturday: the taprooms are still dark. Scrub fifteen minutes forward and watch the pours band snap on almost in unison.",
  },
  {
    key: "handoff",
    label: "The 3 PM handoff",
    slot: atSlot(5, 15),
    line: () => "Mid-afternoon, coffee starts handing the county to the taprooms. One band dims as the other saturates: the changing of the guard.",
  },
  {
    key: "lastcall",
    label: "The 2 AM club",
    slot: atSlot(5, 1, 45),
    line: (c) => `Deep in Friday night, ${c[atSlot(5, 1, 45)]} lights are still burning. The county's late shift is smaller than you think.`,
  },
  {
    key: "sundaynight",
    label: "Sunday, 9 PM",
    slot: atSlot(6, 21),
    line: (c) => `${c[atSlot(6, 21)]} places carry Sunday night. The week's quietest waking hour before the whole board dims.`,
  },
];

export default function RhythmField({
  places,
  masksB64,
  counts,
  peak,
  initialSlot,
}: {
  places: RhythmPlace[];
  masksB64: string;
  counts: number[];
  peak: { slot: number; count: number };
  initialSlot: number;
}) {
  const [slot, setSlot] = useState(initialSlot);
  const [story, setStory] = useState<Story | null>(null);
  const stories = useMemo(() => buildStories(peak), [peak]);
  const [picked, setPicked] = useState<{ place: RhythmPlace; open: boolean } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<{ cols: number; cell: number; dpr: number }>({ cols: 40, cell: 9, dpr: 1 });
  const colorsRef = useRef<Record<RhythmGroup, string> | null>(null);
  const rafRef = useRef<number | null>(null);

  const masks = useMemo(() => {
    const bin = atob(masksB64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }, [masksB64]);

  const bytesPer = WEEK_SLOTS / 8;
  const openAt = useCallback(
    (i: number, s: number) => (masks[i * bytesPer + (s >> 3)] & (1 << (s & 7))) !== 0,
    [masks, bytesPer],
  );

  const paint = useCallback(
    (s: number) => {
      const canvas = canvasRef.current;
      const colors = colorsRef.current;
      if (!canvas || !colors) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { cols, cell, dpr } = layoutRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const r = cell * 0.32;
      for (let i = 0; i < places.length; i++) {
        const x = (i % cols) * cell + cell / 2;
        const y = Math.floor(i / cols) * cell + cell / 2;
        const on = openAt(i, s);
        ctx.beginPath();
        ctx.arc(x, y, on ? r : r * 0.62, 0, Math.PI * 2);
        if (on) {
          ctx.fillStyle = colors[places[i].group];
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = colors.services;
          ctx.globalAlpha = 0.14;
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    [places, openAt],
  );

  // Size the canvas to its container, read palette tokens once, first paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const styles = getComputedStyle(document.documentElement);
    colorsRef.current = Object.fromEntries(
      (Object.keys(GROUP_META) as RhythmGroup[]).map((g) => [
        g,
        styles.getPropertyValue(GROUP_META[g].varName).trim() || GROUP_META[g].fallback,
      ]),
    ) as Record<RhythmGroup, string>;

    const size = () => {
      const w = canvas.parentElement?.clientWidth ?? 360;
      const cols = Math.max(24, Math.floor(w / 9));
      const cell = w / cols;
      const rows = Math.ceil(places.length / cols);
      const h = rows * cell;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      layoutRef.current = { cols, cell, dpr };
      paint(slotRef.current);
    };
    size();
    const ro = new ResizeObserver(size);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- size() closes over paint; re-running on paint identity would rebuild the observer every render
  }, [places.length]);

  // Keep a ref of the current slot so resize can repaint without re-subscribing.
  const slotRef = useRef(slot);
  useEffect(() => {
    slotRef.current = slot;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => paint(slot));
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [slot, paint]);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { cols, cell } = layoutRef.current;
    const col = Math.floor((e.clientX - rect.left) / cell);
    const row = Math.floor((e.clientY - rect.top) / cell);
    const i = row * cols + col;
    if (i >= 0 && i < places.length && col >= 0 && col < cols) {
      setPicked({ place: places[i], open: openAt(i, slot) });
    }
  };

  const jump = (st: Story) => {
    setStory(st);
    setPicked(null);
    setSlot(st.slot);
  };

  const count = counts[slot] ?? 0;
  const dayIndex = Math.floor(slot / SLOTS_PER_DAY);

  return (
    <div className="space-y-4">
      {/* Readout — the big honest number. */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--app-ink-3)" }}>
            {slotLabel(slot)}
          </p>
          <p className="font-serif text-[44px] font-semibold leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
            {count}
            <span className="ml-2 font-serif text-[17px] font-normal italic" style={{ color: "var(--app-ink-3)" }}>
              doors open
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setStory(null);
            setPicked(null);
            setSlot(initialSlot);
          }}
          className="tap-44 rounded-full border px-3.5 py-2 text-[12px] font-semibold"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "var(--app-bg-elevated)" }}
        >
          Now
        </button>
      </div>

      {/* The light board. */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={pick}
          aria-label={`Light board: one dot per place, ${count} lit at ${slotLabel(slot)}`}
          role="img"
          style={{ display: "block", touchAction: "manipulation", cursor: "crosshair" }}
        />
      </div>

      {picked && (
        <p className="font-mono text-[12px]" style={{ color: "var(--app-ink-2)" }}>
          <Link href={`/places/${picked.place.slug}`} className="font-semibold underline" style={{ color: "var(--app-ink)" }}>
            {picked.place.name}
          </Link>
          {" · "}
          {GROUP_META[picked.place.group].label.toLowerCase()} · {picked.open ? "lit at this hour" : "dark at this hour"}
        </p>
      )}

      {/* The week dial. */}
      <div>
        <input
          type="range"
          min={0}
          max={WEEK_SLOTS - 1}
          value={slot}
          onChange={(e) => {
            setStory(null);
            setPicked(null);
            setSlot(Number(e.target.value));
          }}
          aria-label="Scrub the week"
          aria-valuetext={`${slotLabel(slot)}, ${count} places open`}
          className="rhythm-dial w-full"
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-wide" aria-hidden style={{ color: "var(--app-ink-3)" }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <span key={d} style={{ fontWeight: i === dayIndex ? 700 : 400, color: i === dayIndex ? "var(--app-ink)" : undefined }}>
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Story chips — the trends hiding in plain sight. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {stories.map((st) => (
          <button
            key={st.key}
            type="button"
            onClick={() => jump(st)}
            aria-pressed={story?.key === st.key}
            className="tap-44-y shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
            style={{
              borderColor: story?.key === st.key ? "var(--app-brand)" : "var(--app-border)",
              background: story?.key === st.key ? "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated))" : "var(--app-bg-elevated)",
              color: "var(--app-ink-2)",
            }}
          >
            {st.label}
          </button>
        ))}
      </div>
      {story && (
        <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {story.line(counts)}
        </p>
      )}

      {/* Legend + the peak, as quiet mono facts. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {(Object.keys(GROUP_META) as RhythmGroup[]).map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5 font-mono text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: `var(${GROUP_META[g].varName}, ${GROUP_META[g].fallback})` }} />
            {GROUP_META[g].label}
          </span>
        ))}
      </div>
      <p className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
        Week&rsquo;s peak: {peak.count} open · {slotLabel(peak.slot)}
      </p>
    </div>
  );
}
