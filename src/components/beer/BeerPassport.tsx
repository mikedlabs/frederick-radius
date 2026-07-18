"use client";

import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import {
  BREWERIES,
  FAMILY_BY_KEY,
  type Brewery,
  type StyleFamily,
} from "@/data/beers";
import MARKS_RAW from "@/data/brewery-marks.json" with { type: "json" };

/** Brewery logo marks — each brewery's OWN published site icon, fetched
 *  from its website, reviewed by hand (generic platform favicons and
 *  photo-crops excluded), and committed with source provenance. Eight of
 *  seventeen ship one; the rest fall back to the venue photo, then the
 *  monogram. */
const MARKS = MARKS_RAW as Record<string, { file: string; source: string; fetched: string }>;

const STORAGE_KEY = "fr:beer-passport:v1";
const VALID_SLUGS = new Set(BREWERIES.map((brewery) => brewery.slug));
const SERVER_SNAPSHOT: string[] = [];

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedRaw: string | null = null;
let cachedSnapshot: string[] = [];
let memoryOnly = false;
let listeningForStorage = false;

function normalizeVisited(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const requested = new Set(
    value.filter((slug): slug is string => typeof slug === "string" && VALID_SLUGS.has(slug)),
  );
  // Persist and render in the guide's stable brewery order.
  return BREWERIES.filter((brewery) => requested.has(brewery.slug)).map(
    (brewery) => brewery.slug,
  );
}

function readVisited(): string[] {
  if (typeof window === "undefined" || memoryOnly) return cachedSnapshot;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    memoryOnly = true;
    return cachedSnapshot;
  }

  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  if (!raw) {
    cachedSnapshot = [];
    return cachedSnapshot;
  }

  try {
    cachedSnapshot = normalizeVisited(JSON.parse(raw));
  } catch {
    cachedSnapshot = [];
  }
  return cachedSnapshot;
}

function readServerSnapshot(): string[] {
  return SERVER_SNAPSHOT;
}

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent): void {
  // `key === null` means another tab called localStorage.clear().
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  const raw = event.key === null ? null : event.newValue;
  cachedRaw = raw;
  if (!raw) {
    cachedSnapshot = [];
  } else {
    try {
      cachedSnapshot = normalizeVisited(JSON.parse(raw));
    } catch {
      cachedSnapshot = [];
    }
  }
  emitChange();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && !listeningForStorage) {
    window.addEventListener("storage", onStorage);
    listeningForStorage = true;
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && listeners.size === 0 && listeningForStorage) {
      window.removeEventListener("storage", onStorage);
      listeningForStorage = false;
    }
  };
}

function writeVisited(next: string[]): void {
  const normalized = normalizeVisited(next);
  const serialized = JSON.stringify(normalized);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Keep the passport usable for this tab when storage is unavailable.
    memoryOnly = true;
  }
  cachedRaw = serialized;
  cachedSnapshot = normalized;
  emitChange();
}

function toggleVisited(slug: string): void {
  if (!VALID_SLUGS.has(slug)) return;
  const current = readVisited();
  const visited = current.includes(slug);
  writeVisited(
    visited ? current.filter((candidate) => candidate !== slug) : [...current, slug],
  );
  if (!visited && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      (navigator as Navigator & { vibrate?: (pattern: number) => void }).vibrate?.(7);
    } catch {
      // Haptics are a small enhancement; storage remains the source of truth.
    }
  }
}

function dominantFamily(brewery: Brewery): StyleFamily {
  const counts = new Map<StyleFamily, number>();
  let best = brewery.beers[0]?.family ?? "specialty-other";
  let bestCount = 0;
  for (const beer of brewery.beers) {
    const count = (counts.get(beer.family) ?? 0) + 1;
    counts.set(beer.family, count);
    if (count > bestCount) {
      best = beer.family;
      bestCount = count;
    }
  }
  return best;
}

/** Passport-stamp monogram: the first letters of the brewery's two lead
 *  words ("Olde Mother" → OM). Seventeen identical beer-mug clones read
 *  as template filler; a monogram gives each stamp the identity a real
 *  passport stamp has. */
const MONOGRAM_SKIP = new Set(["the", "at", "and", "of"]);
function monogramOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => !MONOGRAM_SKIP.has(w.toLowerCase()));
  return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
}

function progressLine(count: number): string {
  if (count === BREWERIES.length) return "You have visited every brewery listed in this guide.";
  if (count >= 12) return "You have visited nearly all the listed breweries.";
  if (count >= 6) return "You have visited breweries across a good part of the county.";
  if (count > 0) return "The passport is underway.";
  return "Your first stamp is waiting.";
}

/**
 * A manual, device-only brewery passport. A tap records a visit; it never
 * reads location and never implies the visit happened automatically.
 *
 * Stamps use each brewery's reviewed logo mark when one is available,
 * then the taproom's venue photo from the guide's own pipeline. Photos
 * stay desaturated until stamped; monogram initials are the final fallback.
 */
export default function BeerPassport({
  photoBySlug = {},
}: {
  photoBySlug?: Record<string, string | null>;
}) {
  const visited = useSyncExternalStore(subscribe, readVisited, readServerSnapshot);
  const [showAll, setShowAll] = useState(false);
  const visitedSet = new Set(visited);
  const percent = Math.round((visited.length / BREWERIES.length) * 100);

  return (
    <section
      aria-labelledby="beer-passport-heading"
      className="relative -mx-4 overflow-hidden border-y border-black/12 px-4 py-9 text-[#281e14] sm:-mx-5 sm:px-8 sm:py-12 lg:mx-0 lg:rounded-[8px] lg:border lg:px-10"
      style={{
        background: "linear-gradient(145deg, #f4e8d2, #e9d5b7 88%)",
        boxShadow: "0 28px 60px -40px rgba(67,42,20,.42)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(70% 80% at 0% 0%, rgba(255,255,255,.42), transparent 68%), repeating-linear-gradient(90deg, transparent 0 76px, rgba(87,52,22,.025) 77px 78px)",
        }}
      />

      <div className="relative space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#8a3f32]">Your Frederick passport</p>
            <h2
              id="beer-passport-heading"
              className="mt-2 max-w-[9ch] font-serif text-[clamp(2.8rem,9vw,5rem)] font-semibold leading-[0.86] tracking-[-0.05em]"
            >
              Keep track of the breweries you visit.
            </h2>
            <p className="mt-4 max-w-[34rem] text-[12px] leading-relaxed text-black/62">
              Tap a stamp after a visit. Your progress stays on this device, and Radius does not use an account or location to record it.
            </p>
          </div>
          <div className="shrink-0 text-right" aria-live="polite" aria-atomic="true">
            <p
              className="font-serif text-[34px] font-semibold leading-none tabular-nums text-[#8a3f32]"
            >
              {visited.length}/{BREWERIES.length}
            </p>
            <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-black/48">
              stamped
            </p>
          </div>
        </div>

        <div>
          <div
            role="progressbar"
            aria-label={`${visited.length} of ${BREWERIES.length} breweries visited`}
            aria-valuemin={0}
            aria-valuemax={BREWERIES.length}
            aria-valuenow={visited.length}
            className="h-1 overflow-hidden bg-black/14"
          >
            <div
              className="h-full transition-[width] duration-300"
              style={{
                width: `${percent}%`,
                background: "linear-gradient(90deg, #a6523f, #d47a47)",
              }}
            />
          </div>
          <p className="mt-2 text-[10px] text-black/65">
            {progressLine(visited.length)}
          </p>
        </div>

        <div className="border border-black/20 bg-[#efe4cd] p-4 text-[#211811] shadow-[0_18px_44px_rgba(0,0,0,.24)] sm:p-6">
        <div className="flex items-center justify-between border-b border-black/15 pb-3 font-mono text-[8px] uppercase tracking-[0.16em] text-black/42">
          <span>Frederick County · MD</span>
          <span>Beer passport No. 001</span>
        </div>
        <ul className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-6" aria-label="Brewery passport stamps">
          {BREWERIES.map((brewery, index) => {
            const isVisited = visitedSet.has(brewery.slug);
            const family = FAMILY_BY_KEY[dominantFamily(brewery)];
            const mark = MARKS[brewery.slug]?.file ?? null;
            const photo = mark ? null : photoBySlug[brewery.slug] ?? null;
            return (
              <li
                key={brewery.slug}
                className={`${index >= 6 && !showAll ? "hidden sm:block" : ""} min-w-0 text-center`}
              >
                <button
                  type="button"
                  aria-pressed={isVisited}
                  aria-label={
                    isVisited
                      ? `Remove the visited stamp for ${brewery.name}`
                      : `Mark ${brewery.name} as visited`
                  }
                  onClick={() => toggleVisited(brewery.slug)}
                  className={`tap-44 group relative mx-auto flex h-16 w-16 items-center justify-center overflow-visible border-2 border-dashed transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 ${index % 2 ? "rotate-2" : "-rotate-2"}`}
                  style={{
                    borderColor: isVisited ? family.deep : "rgba(33,24,17,.26)",
                    background: mark
                      ? "#fff"
                      : isVisited
                        ? `linear-gradient(145deg, ${family.deep}, color-mix(in srgb, ${family.deep} 78%, #111))`
                        : "rgba(255,255,255,.16)",
                    color: isVisited ? "white" : "rgba(33,24,17,.48)",
                    boxShadow: isVisited
                      ? `0 5px 14px color-mix(in srgb, ${family.deep} 28%, transparent), inset 0 0 0 3px color-mix(in srgb, white 16%, transparent)`
                      : "inset 0 0 0 3px rgba(255,255,255,.2)",
                  }}
                >
                  {mark ? (
                    <span aria-hidden className="absolute inset-[13%] overflow-hidden">
                      {/* The brewery's own logo mark on a white stamp disc —
                          dimmed until stamped, full color once visited. */}
                      <Image
                        src={mark}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-contain transition-[filter] duration-300"
                        style={isVisited ? undefined : { filter: "grayscale(0.7) opacity(0.8)" }}
                      />
                    </span>
                  ) : photo ? (
                    <span aria-hidden className="absolute inset-0 overflow-hidden rounded-full">
                      {/* The taproom's real photo — desaturated until stamped,
                          like an unfilled passport page. Proxy photos skip
                          /_next/image (PlacePhoto convention). */}
                      <Image
                        src={photo}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover transition-[filter] duration-300"
                        style={isVisited ? undefined : { filter: "grayscale(0.85) opacity(0.85)" }}
                        unoptimized={photo.startsWith("/api/place-photo")}
                      />
                    </span>
                  ) : (
                    <span
                      aria-hidden
                      className="font-serif text-[20px] font-semibold leading-none tracking-tight transition-transform group-hover:-rotate-6 sm:text-[22px]"
                    >
                      {monogramOf(brewery.name)}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className="absolute left-1 top-0.5 z-10 grid h-4 min-w-4 place-items-center rounded-full px-0.5 font-mono text-[8px] font-bold tabular-nums"
                    style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "var(--app-edge)" }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {isVisited && (
                    <span
                      aria-hidden
                      className="absolute -bottom-1 -right-1 z-10 grid h-5 w-5 place-items-center border-2"
                      style={{ background: "#1e6b3a", borderColor: "#efe4cd", color: "white" }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
                <Link
                  href={`/places/${brewery.slug}`}
                  className="mt-1.5 flex min-h-11 items-start justify-center pt-1.5 text-[10px] font-semibold leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                  style={{ color: isVisited ? "#211811" : "rgba(33,24,17,.68)" }}
                  title={brewery.name}
                  aria-label={`Open the guide page for ${brewery.name}`}
                >
                  <span className="line-clamp-2">{brewery.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
          className="tap-44-y mx-auto mt-5 flex items-center justify-center border border-black/20 px-4 py-2 text-[11px] font-semibold text-black/68 sm:hidden"
        >
          {showAll ? "Show fewer stamps" : `Show all ${BREWERIES.length} stamps`}
        </button>
        </div>
      </div>
    </section>
  );
}
