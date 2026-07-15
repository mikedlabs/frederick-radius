"use client";

import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { BREWERIES } from "@/data/beers";
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

function progressLine(count: number): string {
  if (count === BREWERIES.length) return "You made it across the county.";
  if (count >= 12) return "Nearly the whole county.";
  if (count >= 6) return "A proper Frederick sampler.";
  if (count > 0) return "Your county log is underway.";
  return "Start with the places you already know.";
}

/**
 * A manual, device-only brewery passport. A tap records a visit; it never
 * reads location and never implies the visit happened automatically.
 */
export default function BeerPassport() {
  const visited = useSyncExternalStore(subscribe, readVisited, readServerSnapshot);
  const [expanded, setExpanded] = useState(false);
  const visitedSet = new Set(visited);
  const percent = Math.round((visited.length / BREWERIES.length) * 100);
  const visibleBreweries = expanded ? BREWERIES : BREWERIES.slice(0, 6);

  return (
    <section
      aria-labelledby="beer-passport-heading"
      className="border-y py-7 sm:py-9"
      style={{ borderColor: "var(--app-border-strong)" }}
    >
      <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.17em]" style={{ color: "var(--app-ink-3)" }}>Your county log</p>
          <h2 id="beer-passport-heading" className="mt-2 max-w-[9ch] font-serif text-[clamp(2.3rem,5vw,3.8rem)] font-semibold leading-[0.94] tracking-[-0.04em]" style={{ color: "var(--beer-ink)" }}>
            Remember the good rooms.
          </h2>
          <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Mark a brewery after you visit. Nothing leaves this device. No account and no location tracking.
          </p>

          <div className="mt-7" aria-live="polite" aria-atomic="true">
            <div className="flex items-end justify-between gap-4">
              <p className="font-serif text-[42px] leading-none tabular-nums" style={{ color: "var(--beer-ink)" }}>{visited.length}<span className="text-[18px] opacity-35">/{BREWERIES.length}</span></p>
              <p className="pb-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>{progressLine(visited.length)}</p>
            </div>
            <div role="progressbar" aria-label={`${visited.length} of ${BREWERIES.length} breweries visited`} aria-valuemin={0} aria-valuemax={BREWERIES.length} aria-valuenow={visited.length} className="mt-3 h-1 overflow-hidden bg-[var(--app-bg-sunken)]">
              <div className="h-full transition-[width] duration-300" style={{ width: `${percent}%`, background: "var(--beer-copper)" }} />
            </div>
          </div>
        </div>

        <div>
          <ul className="grid sm:grid-cols-2" aria-label="Brewery visit log">
          {visibleBreweries.map((brewery, index) => {
            const isVisited = visitedSet.has(brewery.slug);
            return (
              <li key={brewery.slug} className="grid min-h-[78px] grid-cols-[48px_1fr_42px] items-center gap-3 border-t px-1 py-3 sm:odd:pr-4 sm:even:pl-4" style={{ borderColor: "var(--app-border)" }}>
                <BreweryLogo brewerySlug={brewery.slug} breweryName={brewery.name} decorative sizes="48px" className="h-12 w-12 rounded-[10px] bg-white object-contain p-1.5 shadow-sm" />
                <Link href={`/places/${brewery.slug}`} className="group min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]" aria-label={`Open the guide page for ${brewery.name}`}>
                  <span className="block truncate text-[12px] font-semibold" style={{ color: "var(--beer-ink)" }}>{brewery.name}</span>
                  <span className="mt-1 flex items-center gap-1 font-mono text-[8px] font-bold uppercase tracking-[0.09em]" style={{ color: "var(--app-ink-3)" }}>
                    {isVisited ? "Visited" : `Guide ${String(index + 1).padStart(2, "0")}`}
                    <ArrowUpRight className="h-2.5 w-2.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
                <button type="button" aria-pressed={isVisited} aria-label={isVisited ? `Remove ${brewery.name} from visited breweries` : `Mark ${brewery.name} as visited`} onClick={() => toggleVisited(brewery.slug)} className="tap-44 inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]" style={{ borderColor: isVisited ? "var(--beer-copper)" : "var(--app-border-strong)", background: isVisited ? "var(--beer-copper)" : "transparent", color: isVisited ? "white" : "var(--app-ink-3)" }}>
                  {isVisited ? <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : <span className="h-2 w-2 rounded-full border" style={{ borderColor: "currentColor" }} aria-hidden />}
                </button>
              </li>
            );
          })}
          </ul>
          <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="tap-44-y mt-4 inline-flex items-center gap-2 text-[11px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            {expanded ? "Show fewer breweries" : `Show all ${BREWERIES.length} breweries`}
          </button>
        </div>
      </div>
    </section>
  );
}
