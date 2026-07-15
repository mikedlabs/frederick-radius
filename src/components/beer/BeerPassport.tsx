"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  BREWERIES,
  FAMILY_BY_KEY,
  type Brewery,
  type StyleFamily,
} from "@/data/beers";
import { BreweryLogo } from "./BreweryLogo";

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
  const visitedSet = new Set(visited);
  const percent = Math.round((visited.length / BREWERIES.length) * 100);

  return (
    <section
      aria-labelledby="beer-passport-heading"
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border p-4 sm:p-5"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(70% 80% at 0% 0%, color-mix(in srgb, var(--app-accent) 13%, transparent), transparent 68%)",
        }}
      />

      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              Your Frederick passport
            </p>
            <h2
              id="beer-passport-heading"
              className="font-serif text-[22px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              Taprooms you&rsquo;ve visited
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Tap a stamp after a visit. Saved only on this device; no account or location.
            </p>
          </div>
          <div className="shrink-0 text-right" aria-live="polite" aria-atomic="true">
            <p
              className="font-mono text-[22px] font-bold leading-none tabular-nums"
              style={{ color: "var(--app-brand-press)" }}
            >
              {visited.length}/{BREWERIES.length}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
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
            className="h-1.5 overflow-hidden rounded-full"
            style={{ background: "var(--app-bg-sunken)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${percent}%`,
                background: "linear-gradient(90deg, var(--app-accent), var(--app-brand))",
              }}
            />
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {progressLine(visited.length)}
          </p>
        </div>

        <ul className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6" aria-label="Brewery passport stamps">
          {BREWERIES.map((brewery, index) => {
            const isVisited = visitedSet.has(brewery.slug);
            const family = FAMILY_BY_KEY[dominantFamily(brewery)];
            return (
              <li key={brewery.slug} className="min-w-0 text-center">
                <button
                  type="button"
                  aria-pressed={isVisited}
                  aria-label={
                    isVisited
                      ? `Remove the visited stamp for ${brewery.name}`
                      : `Mark ${brewery.name} as visited`
                  }
                  onClick={() => toggleVisited(brewery.slug)}
                  className={`tap-44 group relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 sm:h-16 sm:w-16 ${isVisited ? "border-solid" : "border-dashed"}`}
                  style={{
                    borderColor: isVisited ? family.deep : "var(--app-border-strong)",
                    background: isVisited
                      ? `linear-gradient(145deg, color-mix(in srgb, ${family.deep} 15%, white), color-mix(in srgb, ${family.deep} 7%, white))`
                      : "var(--app-bg-sunken)",
                    boxShadow: isVisited
                      ? `0 4px 12px color-mix(in srgb, ${family.deep} 24%, transparent), inset 0 0 0 3px color-mix(in srgb, white 54%, transparent)`
                      : "inset 0 0 0 3px var(--app-bg-elevated)",
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute left-0.5 top-0.5 z-10 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 font-mono text-[7px] font-bold leading-none tabular-nums"
                    style={{
                      background: "color-mix(in srgb, var(--app-bg-elevated-solid) 88%, transparent)",
                      color: "var(--app-ink-3)",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <BreweryLogo
                    brewerySlug={brewery.slug}
                    breweryName={brewery.name}
                    decorative
                    sizes="48px"
                    className="h-10 w-10 rounded-full bg-white p-1 shadow-sm transition-transform group-hover:scale-[1.04] sm:h-12 sm:w-12"
                  />
                  {isVisited ? (
                    <span
                      aria-hidden
                      className="absolute -bottom-0.5 -right-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2"
                      style={{
                        borderColor: "var(--app-bg-elevated-solid)",
                        background: family.deep,
                        color: "white",
                        boxShadow: "0 2px 5px rgba(0, 0, 0, 0.2)",
                      }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
                <Link
                  href={`/places/${brewery.slug}`}
                  className="mt-1.5 block text-[10px] font-semibold leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                  style={{ color: isVisited ? "var(--app-ink)" : "var(--app-ink-2)" }}
                  title={brewery.name}
                  aria-label={`Open the guide page for ${brewery.name}`}
                >
                  <span className="line-clamp-2">{brewery.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
