"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { TABS, tabIndexForPath } from "./tabs";

/**
 * SideRail — desktop primary nav (≥lg, 1024px+).
 *
 * Vertical mirror of BottomNav. Floating rounded-pill column on the
 * left edge with the same 4 tabs, the same glass treatment, and the
 * same MOVING BRAND PILL behind the active tab (left/width became
 * top/height for the vertical axis). Hidden below lg; BottomNav
 * carries everything below that breakpoint.
 *
 * Width is ~80px so it sits beside content without dominating. The
 * (app) shell adds matching left padding at lg+ so the centered
 * content area clears the rail.
 *
 * TABS + tabIndexForPath are imported from `./tabs.ts` — same
 * source of truth as BottomNav, so adding/relabeling a tab updates
 * both navs at once. The retired "Field guide" drawer trigger moved
 * to a More icon in TopBar (see TopBar.tsx) — both navs no longer
 * carry a 5th drawer tab.
 */
export default function SideRail() {
  const pathname = usePathname();
  const router = useRouter();

  // -1 (no tab) hides the indicator instead of falsely lighting "Today"
  // on non-tab pages — matches BottomNav.
  const realIdx = tabIndexForPath(pathname);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset optimistic state once the actual route change completes
    setPendingIdx(null);
  }, [pathname]);
  const activeIdx = pendingIdx ?? realIdx;

  // Measure the active tab so the brand pill sits exactly behind it.
  const stripRef = useRef<HTMLUListElement>(null);
  const tabRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [pill, setPill] = useState<{ top: number; height: number }>({ top: 0, height: 0 });
  useEffect(() => {
    function measure() {
      const strip = stripRef.current;
      const cell = tabRefs.current[activeIdx];
      if (!strip || !cell) return;
      const sBox = strip.getBoundingClientRect();
      const cBox = cell.getBoundingClientRect();
      // 56px chip behind icon — fits the 12px-of-padding glass pill
      // shape from the bottom nav, just rotated vertically.
      const pillH = Math.min(58, cBox.height - 8);
      const top = cBox.top - sBox.top + (cBox.height - pillH) / 2;
      setPill({ top, height: pillH });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIdx]);

  return (
    <div
      // Hidden below lg (`hidden … lg:flex`); BottomNav owns small
      // viewports. The hide is `display:none`, which removes this nav
      // from the a11y tree AND the tab order below lg, so only one
      // "Primary" nav is ever exposed. NOTE: do not put aria-hidden on
      // this wrapper — it contains the focusable <nav>, so aria-hidden
      // here would hide the desktop primary nav from screen readers
      // while leaving its links keyboard-focusable (the WCAG
      // focusable-inside-aria-hidden failure the audit flagged).
      className="pointer-events-none fixed bottom-0 left-0 top-0 hidden py-4 pl-3 lg:flex lg:items-center"
      style={{ zIndex: "var(--z-nav)" }}
    >
      <nav
        aria-label="Primary"
        className="pointer-events-auto relative overflow-hidden rounded-full"
        style={{
          background: "color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent)",
          backdropFilter: "blur(22px) saturate(1.15)",
          WebkitBackdropFilter: "blur(22px) saturate(1.15)",
          border: "1px solid var(--app-border)",
          boxShadow:
            "0 10px 28px -8px rgba(20,20,18,0.22), 0 2px 6px rgba(20,20,18,0.10), var(--app-edge), var(--app-hi)",
        }}
      >
        {/* Vertical brand pill — top/height morphs between cells with
            the same spring easing as BottomNav's horizontal pill. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 z-0 w-12 -translate-x-1/2 rounded-full"
          style={{
            top: pill.top,
            height: pill.height,
            background:
              "linear-gradient(155deg, color-mix(in srgb, var(--app-brand) 22%, var(--app-bg-elevated)) 0%, color-mix(in srgb, var(--app-brand) 14%, var(--app-bg-elevated)) 100%)",
            boxShadow:
              "0 6px 16px -6px color-mix(in srgb, var(--app-brand) 50%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--app-brand) 28%, transparent)",
            transition:
              "top 320ms var(--app-ease-spring), height 320ms var(--app-ease-spring), opacity 200ms ease",
            opacity: pill.height > 0 ? 1 : 0,
          }}
        />

        <ul
          ref={stripRef}
          className="relative z-10 flex flex-col items-stretch gap-1 px-1.5 py-1.5"
        >
          {TABS.map(({ href, label, icon: Icon, fillOnActive }, idx) => {
            const isRealActive =
              pathname === href || pathname.startsWith(href + "/");
            const isPendingActive = pendingIdx === idx;
            const active = isRealActive || isPendingActive;

            const handleActivate = (e?: { preventDefault?: () => void }) => {
              if (isRealActive) return;
              setPendingIdx(idx);
              haptic("light");
              if (e && typeof document !== "undefined" && "startViewTransition" in document) {
                e.preventDefault?.();
                const doc = document as Document & {
                  startViewTransition?: (cb: () => void) => unknown;
                };
                doc.startViewTransition?.(() => router.push(href));
              }
            };

            const tabClass =
              "group relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-full text-center transition-transform active:scale-[0.92]";
            const tabStyle = {
              color: active ? "var(--app-brand)" : "var(--app-ink-3)",
              transitionTimingFunction: "var(--app-ease-spring)",
              transitionDuration: "var(--app-dur-fast)",
            } as const;

            return (
              <li
                key={href}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                className="flex"
              >
                <Link
                  href={href}
                  onPointerDown={() => {
                    if (!isRealActive) setPendingIdx(idx);
                  }}
                  onClick={(e) => handleActivate(e)}
                  className={tabClass}
                  style={tabStyle}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className="transition-transform duration-200"
                    width={active ? 22 : 20}
                    height={active ? 22 : 20}
                    strokeWidth={active ? 2.25 : 2}
                    fill={active && fillOnActive ? "currentColor" : "none"}
                    style={{
                      transform: active ? "scale(1.04)" : "scale(1)",
                      transitionTimingFunction: "var(--app-ease-spring)",
                    }}
                  />
                  <span
                    className="text-[11px] font-medium leading-tight tracking-tight transition-opacity"
                    style={{ opacity: active ? 1 : 0.78 }}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
