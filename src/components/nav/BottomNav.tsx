"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { TABS, tabIndexForPath } from "./tabs";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Real index from the current route, or -1 when the page isn't under
  // any tab (a place detail, /settings, /about…). We deliberately do
  // NOT fall back to 0 — that's what made every non-tab page falsely
  // light up "Today". At -1 the moving pill simply hides (the measure
  // effect finds no cell), so no tab is mis-highlighted.
  const realIdx = tabIndexForPath(pathname);

  // Optimistic index. Set on pointer-down so the indicator slides
  // within one frame, before the server-side route work begins. The
  // reconcile effect below clears it when the real route catches up,
  // which collapses the optimistic state cleanly.
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  useEffect(() => {
    // The pathname only changes after navigation completes. When it
    // does, the optimistic state has done its job and can retire.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset optimistic state once the actual route change completes; the pathname dep is the signal
    setPendingIdx(null);
  }, [pathname]);

  const activeIdx = pendingIdx ?? realIdx;

  // Measure the tab strip + active tab so the indicator pill can sit
  // EXACTLY behind the active chip. Recomputes on resize and on
  // active-tab change. Using a measured pill instead of a CSS-only
  // "100% / 5" calc lets us pad the pill smaller than the tab cell
  // so it reads as a chip behind the icon, not a full-column slab.
  const stripRef = useRef<HTMLUListElement>(null);
  const tabRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [pill, setPill] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  useEffect(() => {
    function measure() {
      const strip = stripRef.current;
      const cell = tabRefs.current[activeIdx];
      if (!strip || !cell) return;
      const sBox = strip.getBoundingClientRect();
      const cBox = cell.getBoundingClientRect();
      // Pad the pill to roughly the chip width — 48px wide centered
      // on the cell's icon, clamped to the cell.
      const pillW = Math.min(54, cBox.width - 8);
      const left = cBox.left - sBox.left + (cBox.width - pillW) / 2;
      setPill({ left, width: pillW });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIdx]);

  return (
    <div
      aria-hidden
      // Hide the floating bottom pill at lg+ where the SideRail
      // takes over as the primary nav.
      className="pointer-events-none fixed inset-x-0 bottom-0 px-3 lg:hidden"
      // Tokenized z-index (--z-nav) — see globals.css :root --z-*
      // scale. Lift the pill above the iOS safe-area inset so the
      // nav doesn't sit on top of the home indicator.
      style={{
        zIndex: "var(--z-nav)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
      }}
    >
      <nav
        aria-label="Primary"
        className="pointer-events-auto relative mx-auto max-w-screen-md overflow-hidden rounded-full"
        style={{
          // Fully opaque so scroll content never ghosts through the pill
          // (the audit caught tiles/headers bleeding at 92%). Blur kept for
          // a faint frosted edge; with a solid fill it's purely aesthetic.
          background: "var(--app-bg-elevated-solid)",
          backdropFilter: "blur(22px) saturate(1.15)",
          WebkitBackdropFilter: "blur(22px) saturate(1.15)",
          border: "1px solid var(--app-border)",
          boxShadow:
            "0 10px 28px -8px rgba(20,20,18,0.22), 0 2px 6px rgba(20,20,18,0.10), var(--app-edge), var(--app-hi)",
        }}
      >
        {/* Moving brand pill — sits BEHIND the active tab's icon. CSS
            transform on `left/width` so the pill morphs between cells
            with the same spring easing the indicator bar used before.
            The pill carries the brand color + glow; the icon and
            label ride on top with brand ink color when active. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 z-0 h-10 -translate-y-1/2 rounded-full"
          style={{
            left: pill.left,
            width: pill.width,
            background:
              "linear-gradient(155deg, color-mix(in srgb, var(--app-brand) 22%, var(--app-bg-elevated)) 0%, color-mix(in srgb, var(--app-brand) 14%, var(--app-bg-elevated)) 100%)",
            boxShadow:
              "0 6px 16px -6px color-mix(in srgb, var(--app-brand) 50%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--app-brand) 28%, transparent)",
            transition:
              "left 320ms var(--app-ease-spring), width 320ms var(--app-ease-spring), opacity 200ms ease",
            opacity: pill.width > 0 ? 1 : 0,
          }}
        />

        <ul
          ref={stripRef}
          className="relative z-10 mx-auto grid max-w-screen-md grid-cols-5 px-1.5 py-1.5"
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
              "group relative flex h-12 flex-col items-center justify-center gap-1 rounded-full text-center transition-transform active:scale-[0.92]";
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
                  className={tabClass + " w-full"}
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
                      transform: active ? "translateY(-1px) scale(1.04)" : "translateY(0)",
                      transitionTimingFunction: "var(--app-ease-spring)",
                    }}
                  />
                  <span
                    className="text-[11px] font-semibold leading-tight tracking-tight transition-opacity"
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
