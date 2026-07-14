"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X, Heart, Star, RotateCcw, ArrowRight } from "lucide-react";
import {
  breweriesForFamilies,
  tasteTitle,
  beerKey,
  FAMILY_BY_KEY,
  type BeerWithBrewery,
  type StyleFamily,
} from "@/data/beers";
import { addSaved } from "@/hooks/useSaved";
import BeerCard from "./BeerCard";

type Verdict = "pass" | "like" | "love";
const THRESH = 96;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

/**
 * The beer taste finder. Swipe a deck of beer cards (right = yes, left = no,
 * up = love it), and it learns which styles you lean toward, then sends you to
 * the Frederick breweries that pour them. Pure pointer + keyboard, no library;
 * calm and instant under reduced motion.
 */
export default function BeerSwipeDeck({ deck }: { deck: BeerWithBrewery[] }) {
  // Deterministic SSR order; shuffled once on the client so the deck feels fresh.
  const [cards, setCards] = useState(deck);
  const [i, setI] = useState(0);
  const [score, setScore] = useState<Partial<Record<StyleFamily, number>>>({});
  const [loved, setLoved] = useState<BeerWithBrewery[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exit, setExit] = useState<Verdict | null>(null);
  const [revealed, setRevealed] = useState(false);
  const reduce = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  // Shuffle once on mount, client-side only, so SSR stays deterministic and
  // hydration matches; then the deck feels fresh each visit.
  useEffect(() => {
    setCards(shuffle(deck));
  }, [deck]);

  useEffect(() => {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  function restart() {
    setCards(shuffle(deck));
    setI(0);
    setScore({});
    setLoved([]);
    setRevealed(false);
  }

  const seen = i;
  const total = cards.length;
  const done = i >= total;

  function commit(v: Verdict) {
    if (exit || done) return;
    const beer = cards[i];
    if (!beer) return;
    // Weight: like = 1, love = 2 toward that family; passes teach nothing.
    if (v !== "pass") {
      setScore((s) => ({ ...s, [beer.family]: (s[beer.family] ?? 0) + (v === "love" ? 2 : 1) }));
      if (v === "love") {
        setLoved((l) => [...l, beer]);
        addSaved("beer", beerKey(beer)); // love saves it to My taps
      }
    }
    const advance = () => {
      setExit(null);
      setDrag({ x: 0, y: 0, active: false });
      setI((n) => n + 1);
      startRef.current = null;
    };
    if (reduce.current) advance();
    else {
      setExit(v);
      window.setTimeout(advance, 300);
    }
  }

  // Keyboard: left = pass, right = like, up = love.
  useEffect(() => {
    if (revealed || done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") commit("pass");
      else if (e.key === "ArrowRight") commit("like");
      else if (e.key === "ArrowUp") commit("love");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onDown(e: React.PointerEvent) {
    if (exit) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
  }
  function onMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y, active: true });
  }
  function onUp() {
    if (!startRef.current) return;
    const { x, y } = drag;
    startRef.current = null;
    if (y < -THRESH && Math.abs(y) > Math.abs(x)) commit("love");
    else if (x > THRESH) commit("like");
    else if (x < -THRESH) commit("pass");
    else setDrag({ x: 0, y: 0, active: false });
  }

  const topFamilies = useMemo(
    () =>
      (Object.entries(score) as Array<[StyleFamily, number]>)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k),
    [score],
  );

  if (revealed || (done && total > 0)) {
    return <Reveal families={topFamilies} loved={loved} onRestart={restart} />;
  }

  const glow =
    drag.x > 24 ? "var(--app-brand-2)" : drag.x < -24 ? "var(--app-ink-3)" : drag.y < -24 ? "var(--app-accent)" : null;

  return (
    <div className="mx-auto w-full max-w-[22rem]">
      {/* Card stack */}
      <div className="relative mx-auto h-[21rem] select-none">
        {cards.slice(i, i + 3).map((beer, k) => {
          const isTop = k === 0;
          const dx = isTop ? drag.x : 0;
          const dy = isTop ? drag.y : 0;
          const rot = isTop ? dx * 0.04 : 0;
          const exiting = isTop && exit;
          const tx = exiting ? (exit === "like" ? 600 : exit === "pass" ? -600 : dx) : dx;
          const ty = exiting && exit === "love" ? -700 : dy;
          return (
            <div
              key={`${beer.brewerySlug}-${beer.name}`}
              onPointerDown={isTop ? onDown : undefined}
              onPointerMove={isTop ? onMove : undefined}
              onPointerUp={isTop ? onUp : undefined}
              className="absolute inset-0"
              style={{
                transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${1 - k * 0.04})`,
                top: `${k * 10}px`,
                opacity: exiting ? 0 : 1,
                transition: drag.active && isTop ? "none" : "transform 300ms cubic-bezier(.22,.61,.36,1), opacity 300ms",
                zIndex: 10 - k,
                cursor: isTop ? "grab" : "default",
                touchAction: "none",
              }}
            >
              <BeerCard beer={beer} />
              {isTop && glow && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[var(--app-radius-lg)]"
                  style={{ boxShadow: `inset 0 0 0 3px ${glow}`, opacity: Math.min(1, Math.abs(dx || dy) / 120) }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <IconBtn label="Pass" onClick={() => commit("pass")} tint="var(--app-ink-3)">
          <X className="h-6 w-6" strokeWidth={2.5} aria-hidden />
        </IconBtn>
        <IconBtn label="Save to My taps" onClick={() => commit("love")} tint="var(--app-accent-press)" small>
          <Star className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </IconBtn>
        <IconBtn label="Like" onClick={() => commit("like")} tint="var(--app-brand-2)">
          <Heart className="h-6 w-6" strokeWidth={2.5} aria-hidden />
        </IconBtn>
      </div>

      <div className="mt-4 flex items-center justify-between text-[12px]" style={{ color: "var(--app-ink-3)" }}>
        <span className="font-mono tabular-nums">{Math.min(seen + 1, total)} / {total}</span>
        {seen >= 5 && (
          <button onClick={() => setRevealed(true)} className="tap-44 inline-flex items-center gap-1 font-semibold" style={{ color: "var(--app-brand-press)" }}>
            See your matches <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        Swipe right to like, left to pass, up to save (★) to My taps. Or use the buttons.
      </p>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  tint,
  small,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  tint: string;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-full border-2 bg-[var(--app-bg-elevated-solid)] transition active:scale-90 ${small ? "h-12 w-12" : "h-14 w-14"}`}
      style={{ borderColor: tint, color: tint, boxShadow: "var(--app-elev-1)" }}
    >
      {children}
    </button>
  );
}

function Reveal({
  families,
  loved,
  onRestart,
}: {
  families: StyleFamily[];
  loved: BeerWithBrewery[];
  onRestart: () => void;
}) {
  const picked = families.slice(0, 3);
  const ranked = picked.length ? breweriesForFamilies(picked).slice(0, 6) : [];
  const title = tasteTitle(picked);

  if (!picked.length) {
    return (
      <div className="mx-auto max-w-[22rem] rounded-[var(--app-radius-lg)] border p-6 text-center" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
        <p className="text-[14px]" style={{ color: "var(--app-ink-2)" }}>
          You passed on everything. Tough crowd. Give it another go and like a few.
        </p>
        <button onClick={onRestart} className="tap-44 mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--app-brand)" }}>
          <RotateCcw className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Start over
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[24rem]">
      <div className="rounded-[var(--app-radius-lg)] border p-5 text-center" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-1)" }}>
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>Your taste</p>
        <h2 className="mt-1 font-serif text-[30px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {picked.map((f) => (
            <span key={f} className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: FAMILY_BY_KEY[f].deep }}>
              {FAMILY_BY_KEY[f].label}
            </span>
          ))}
        </div>
      </div>

      <h3 className="mt-6 font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
        Your Frederick lineup
      </h3>
      <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
        The breweries that pour what you liked, best matches first.
      </p>
      <ul className="mt-3 space-y-2.5">
        {ranked.map(({ brewery, matches }) => (
          <li key={brewery.slug}>
            <Link
              href={`/places/${brewery.slug}`}
              className="flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border p-3 transition hover:bg-[var(--app-bg-sunken)]"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
            >
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>{brewery.name}</span>
                <span className="block truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                  {matches.slice(0, 3).map((m) => m.name).join(", ")}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums" style={{ color: "var(--app-brand-press)" }}>
                {matches.length} match{matches.length === 1 ? "" : "es"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href="/collections/beer-around-frederick" className="tap-44 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--app-brand)" }}>
          Plan a beer day <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </Link>
        <button onClick={onRestart} className="tap-44 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold" style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink-2)" }}>
          <RotateCcw className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Swipe again
        </button>
      </div>
      {loved.length > 0 && (
        <p className="mt-3 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Saved to My taps: {loved.map((b) => b.name).join(", ")}.
        </p>
      )}
    </div>
  );
}
