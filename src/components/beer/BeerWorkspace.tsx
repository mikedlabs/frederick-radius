"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

type BeerMode = "find" | "index" | "taprooms" | "tonight";

const MODES: ReadonlyArray<{ key: BeerMode; label: string }> = [
  { key: "find", label: "Find a beer" },
  { key: "index", label: "All beers" },
  { key: "taprooms", label: "Taprooms" },
  { key: "tonight", label: "This week" },
];

const HASH_MODE: Record<string, BeerMode> = {
  "#beer-index": "index",
  "#beer-week": "tonight",
  "#find-your-pour": "find",
  "#on-tap-now": "tonight",
  "#taproom-map": "taprooms",
  "#my-taps": "find",
};

const MODE_HASH: Record<BeerMode, string> = {
  find: "#find-your-pour",
  index: "#beer-index",
  taprooms: "#taproom-map",
  tonight: "#beer-week",
};

export function beerModeForHash(hash: string): BeerMode | null {
  if (!hash || hash === "#") return "find";
  return HASH_MODE[hash.toLocaleLowerCase()] ?? null;
}

function scrollToHashTarget(hash: string) {
  let targetId: string;
  try {
    targetId = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return;
  }
  if (!targetId) return;

  // The target may live in a panel that React has not committed yet. Two
  // frames cover the state update without relying on an arbitrary timeout.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
  });
}

/**
 * One beer task at a time. The old page stacked the beer finder, full catalog,
 * brewery directory, events, map, and saved pours into one very long page.
 * This workspace keeps all of that depth while making the user's current job
 * the only full-size section on screen.
 */
export default function BeerWorkspace({
  find,
  index,
  taprooms,
  tonight,
}: {
  find: ReactNode;
  index: ReactNode;
  taprooms: ReactNode;
  tonight: ReactNode;
}) {
  const [mode, setMode] = useState<BeerMode>("find");

  useEffect(() => {
    const syncFromUrl = () => {
      const fromHash = beerModeForHash(window.location.hash);
      if (!fromHash) return;
      setMode(fromHash);
      scrollToHashTarget(window.location.hash);
    };

    syncFromUrl();
    window.addEventListener("hashchange", syncFromUrl);
    // pushState itself does not dispatch hashchange. popstate keeps Back and
    // Forward correct for mode changes made by the segmented control.
    window.addEventListener("popstate", syncFromUrl);
    return () => {
      window.removeEventListener("hashchange", syncFromUrl);
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, []);

  const chooseMode = useCallback((nextMode: BeerMode) => {
    const hash = MODE_HASH[nextMode];
    setMode(nextMode);

    if (window.location.hash !== hash) {
      const url = new URL(window.location.href);
      url.hash = hash;
      window.history.pushState(window.history.state, "", url);
    }
    // A mode button replaces the panel directly beneath the control, so keep
    // the reader anchored at the control. Direct links and browser history
    // still scroll to their exact child anchor through syncFromUrl above.
  }, []);

  const panel = { find, index, taprooms, tonight }[mode];

  return (
    <section aria-label="Frederick County beer guide" className="space-y-7">
      <div
        role="tablist"
        aria-label="Choose a beer guide"
        className="grid grid-cols-4 border-y"
        style={{ borderColor: "var(--app-border-strong)" }}
      >
        {MODES.map((item, index) => {
          const active = item.key === mode;
          return (
            <button
              key={item.key}
              id={`beer-mode-${item.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="beer-workspace-panel"
              onClick={() => chooseMode(item.key)}
              className="relative min-h-[58px] min-w-0 border-r px-2 py-2 text-left last:border-r-0 sm:px-3"
              style={{
                borderColor: "var(--app-border)",
                background: active ? "color-mix(in srgb, var(--app-amber) 8%, transparent)" : "transparent",
                color: active ? "var(--app-ink)" : "var(--app-ink-2)",
                boxShadow: active ? "inset 0 -3px 0 var(--app-amber-text)" : undefined,
              }}
            >
              <span className="block font-mono text-[8px] font-bold tabular-nums tracking-[0.12em]" style={{ color: active ? "var(--app-amber-text)" : "var(--app-ink-3)" }}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="mt-1 block text-[11px] font-semibold leading-tight sm:text-[12px]">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div
        key={mode}
        id="beer-workspace-panel"
        role="tabpanel"
        aria-labelledby={`beer-mode-${mode}`}
      >
        {panel}
      </div>
    </section>
  );
}
