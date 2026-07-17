"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import {
  BREWERIES,
  FAMILY_BY_KEY,
  type Brewery,
  type StyleFamily,
} from "@/data/beers";

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
  if (count === BREWERIES.length) return "County complete. That is one well-used field guide.";
  if (count >= 12) return "Nearly the whole county.";
  if (count >= 6) return "A proper Frederick sampler.";
  if (count > 0) return "The passport is underway.";
  return "Your first stamp is waiting.";
}

/**
 * A manual, device-only brewery passport. A tap records a visit; it never
 * reads location and never implies the visit happened automatically.
 */
export default function BeerPassport() {
  const visited = useSyncExternalStore(subscribe, readVisited, readServerSnapshot);
  const [showAll, setShowAll] = useState(false);
  const visitedSet = new Set(visited);
  const percent = Math.round((visited.length / BREWERIES.length) * 100);

  return (
    <section
      aria-labelledby="beer-passport-heading"
      className="relative -mx-4 overflow-hidden border-y border-white/10 px-4 py-9 text-[#f7f0e4] sm:-mx-5 sm:px-8 sm:py-12 lg:mx-0 lg:rounded-[8px] lg:border lg:px-10"
      style={{
        background: "linear-gradient(145deg, #742c20, #2b1915 88%)",
        boxShadow: "0 28px 60px -38px rgba(43,18,12,.82)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(70% 80% at 0% 0%, rgba(255,214,137,.18), transparent 68%), repeating-linear-gradient(90deg, transparent 0 76px, rgba(255,255,255,.018) 77px 78px)",
        }}
      />

      <div className="relative space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#f2c981]">Your Frederick passport</p>
            <h2
              id="beer-passport-heading"
              className="mt-2 max-w-[9ch] font-serif text-[clamp(2.8rem,9vw,5rem)] font-semibold leading-[0.86] tracking-[-0.05em]"
            >
              Stamp your way across the county.
            </h2>
            <p className="mt-4 max-w-[34rem] text-[12px] leading-relaxed text-white/58">
              Tap a stamp after a visit. Saved only on this device; no account or location.
            </p>
          </div>
          <div className="shrink-0 text-right" aria-live="polite" aria-atomic="true">
            <p
              className="font-serif text-[34px] font-semibold leading-none tabular-nums text-[#f2c981]"
            >
              {visited.length}/{BREWERIES.length}
            </p>
            <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/42">
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
            className="h-1 overflow-hidden bg-black/24"
          >
            <div
              className="h-full transition-[width] duration-300"
              style={{
                width: `${percent}%`,
                background: "linear-gradient(90deg, #f2c981, #f07a58)",
              }}
            />
          </div>
          <p className="mt-2 text-[10px] text-white/46">
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
                  className={`tap-44 group relative mx-auto flex h-16 w-16 items-center justify-center border-2 border-dashed transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 ${index % 2 ? "rotate-2" : "-rotate-2"}`}
                  style={{
                    borderColor: isVisited ? family.deep : "rgba(33,24,17,.26)",
                    background: isVisited
                      ? `linear-gradient(145deg, ${family.deep}, color-mix(in srgb, ${family.deep} 78%, #111))`
                      : "rgba(255,255,255,.16)",
                    color: isVisited ? "white" : "rgba(33,24,17,.48)",
                    boxShadow: isVisited
                      ? `0 5px 14px color-mix(in srgb, ${family.deep} 28%, transparent), inset 0 0 0 3px color-mix(in srgb, white 16%, transparent)`
                      : "inset 0 0 0 3px rgba(255,255,255,.2)",
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute left-1.5 top-1 font-mono text-[8px] font-bold tabular-nums opacity-70"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden
                    className="font-serif text-[22px] font-semibold leading-none tracking-tight transition-transform group-hover:-rotate-6"
                  >
                    {monogramOf(brewery.name)}
                  </span>
                  {isVisited && (
                    <span
                      aria-hidden
                      className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center border-2"
                      style={{ background: "#1e6b3a", borderColor: "#efe4cd", color: "white" }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
                <Link
                  href={`/places/${brewery.slug}`}
                  className="mt-1.5 block text-[10px] font-semibold leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
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
