"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sun, Compass, Calendar, Bookmark } from "lucide-react";
import { haptic } from "@/lib/haptics";

// Primary destinations. Tightened from five per the architecture
// overhaul: /places, /radius (Near Me), and /map all answered the
// same question ("see things spatially"), splitting attention
// across three entries. They live under /browse now, with mode
// chips inside the page for Pan vs Within reach. /events ("Plan")
// and /saved round out the model. /places + /radius remain as
// routes (deep links survive); they are no longer primary tabs.
const TABS = [
  { href: "/now", label: "Now", icon: Sun },
  { href: "/browse", label: "Browse", icon: Compass },
  { href: "/events", label: "Plan", icon: Calendar },
  { href: "/saved", label: "Saved", icon: Bookmark },
] as const;

/** Resolve a pathname to its tab index (or -1 if it is not a tab). */
function tabIndexForPath(pathname: string): number {
  return TABS.findIndex(
    (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Real index from the current route. Falls back to 0 so the slider
  // still has a home on non-primary routes (e.g. /about, /settings).
  const realIdx = Math.max(0, tabIndexForPath(pathname));

  // Optimistic index. Set on pointer-down so the indicator slides
  // within one frame, before the server-side route work begins. The
  // reconcile effect below clears it when the real route catches up,
  // which collapses the optimistic state cleanly.
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  useEffect(() => {
    // The pathname only changes after navigation completes. When it
    // does, the optimistic state has done its job and can retire.
    setPendingIdx(null);
  }, [pathname]);

  const activeIdx = pendingIdx ?? realIdx;

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--app-border)] bg-[var(--app-bg-elevated)]/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      {/* Sliding indicator bar. Thin brand strip that slides
          horizontally between tabs. CSS transform (not left/width)
          so it animates on the compositor. The subtle glow underneath
          tracks with it. Driven by activeIdx, which is set
          optimistically on pointer-down (one-frame response). */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-10 h-[2.5px] origin-left rounded-b-full"
        style={{
          width: `${100 / TABS.length}%`,
          background:
            "linear-gradient(90deg, transparent 0%, var(--app-brand) 18%, var(--app-brand) 82%, transparent 100%)",
          transform: `translateX(${activeIdx * 100}%)`,
          transition: "transform 280ms var(--app-ease-spring)",
          boxShadow: "0 4px 12px -2px color-mix(in srgb, var(--app-brand) 45%, transparent)",
        }}
      />
      <ul className="mx-auto grid max-w-screen-md grid-cols-4">
        {TABS.map(({ href, label, icon: Icon }, idx) => {
          // Treat the tab as "active" when either:
          //   - the real pathname already matches it, OR
          //   - the user has just tapped it and we are mid-navigation
          // The optimistic branch is what makes the chip light up and
          // the indicator slide within a single frame of the touch.
          const isRealActive =
            pathname === href || pathname.startsWith(href + "/");
          const isPendingActive = pendingIdx === idx;
          const active = isRealActive || isPendingActive;

          const handleActivate = (e?: { preventDefault?: () => void }) => {
            if (isRealActive) return;
            // Set optimistic state synchronously so the indicator
            // moves on this frame. The Link's prefetch has already
            // primed the route; the View Transition below ties the
            // old and new layouts together.
            setPendingIdx(idx);
            haptic("light");
            // Use the View Transitions API when available so the
            // route change animates as one continuous motion rather
            // than a hard swap. No-op on browsers that lack the API.
            if (e && typeof document !== "undefined" && "startViewTransition" in document) {
              e.preventDefault?.();
              const doc = document as Document & {
                startViewTransition?: (cb: () => void) => unknown;
              };
              doc.startViewTransition?.(() => router.push(href));
            }
          };

          return (
            <li key={href} className="flex">
              <Link
                href={href}
                onPointerDown={() => {
                  // Pointer-down fires before click on touch and mouse,
                  // so the optimistic indicator moves before the link
                  // navigates. The Link's own click handler will fire
                  // immediately after and complete the navigation.
                  if (!isRealActive) setPendingIdx(idx);
                }}
                onClick={(e) => handleActivate(e)}
                className="group relative flex flex-1 flex-col items-center gap-0.5 px-1 pt-1.5 pb-1 text-[10px] font-semibold tracking-tight transition-transform active:scale-[0.92]"
                style={{
                  color: active ? "var(--app-brand)" : "var(--app-ink-3)",
                  transitionTimingFunction: "var(--app-ease-spring)",
                  transitionDuration: "var(--app-dur-fast)",
                }}
                aria-current={active ? "page" : undefined}
              >
                {/* Icon pill. Active gets the brand-tinted background
                    with the tactile-glow-brand shadow + lip so the
                    selected tab visibly lifts and catches light.
                    Inactive stays flat ink-3 and lifts on hover
                    (desktop only). The optimistic active style flips
                    immediately on pointer-down. */}
                <span
                  className={`grid h-9 w-[52px] place-items-center rounded-full transition-all duration-200 ${
                    active ? "tactile tactile-lift tactile-glow-brand" : ""
                  }`}
                  style={{
                    background: active
                      ? "color-mix(in srgb, var(--app-brand) 18%, var(--app-bg-elevated))"
                      : "transparent",
                    transitionTimingFunction: "var(--app-ease-spring)",
                  }}
                  aria-hidden
                >
                  <Icon
                    className={`transition-transform duration-200 ${
                      active ? "h-[20px] w-[20px]" : "h-[19px] w-[19px] group-hover:-translate-y-[1px]"
                    }`}
                    strokeWidth={active ? 2.5 : 2}
                  />
                </span>
                <span
                  className="transition-opacity"
                  style={{ opacity: active ? 1 : 0.85 }}
                >
                  {label}
                </span>
                {/* Active indicator dot. Small brand chip beneath the
                    label so the selected route reads clearly even
                    when glancing at the nav peripherally. */}
                <span
                  aria-hidden
                  className="absolute bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full transition-opacity"
                  style={{
                    background: "var(--app-brand)",
                    opacity: active ? 1 : 0,
                  }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
