"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { TABS, RADIUS_LAUNCHER, tabIndexForPath } from "./tabs";

/**
 * SideRail is the desktop primary nav (lg and up, 1024px+).
 *
 * It is the vertical mirror of BottomNav: a floating rounded-pill column
 * on the left edge with the same slots, the same glass treatment, and
 * the same moving brand pill behind the active tab (left and width
 * became top and height for the vertical axis). It is hidden below lg,
 * where BottomNav carries everything.
 *
 * A vertical rail cannot raise a center button the way the mobile bar
 * does, so the Radius launcher reads as a brand-filled disc set inline
 * between Map and Events. The fill is what sets it apart from the
 * outline tabs, which keeps the radius as the prominent action without a
 * physical raise that vertical layout cannot carry.
 *
 * TABS, RADIUS_LAUNCHER, and tabIndexForPath all come from ./tabs, the
 * same source of truth as BottomNav, so relabeling a slot updates both
 * navs at once.
 */
export default function SideRail() {
  const pathname = usePathname();
  const router = useRouter();

  // -1 on non-tab routes — no false highlight; the pill hides instead.
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
      const cell = activeIdx >= 0 ? tabRefs.current[activeIdx] : null;
      if (!strip || !cell) {
        setPill((p) => (p.height === 0 ? p : { ...p, height: 0 }));
        return;
      }
      const sBox = strip.getBoundingClientRect();
      const cBox = cell.getBoundingClientRect();
      const pillH = Math.min(58, cBox.height - 8);
      const top = cBox.top - sBox.top + (cBox.height - pillH) / 2;
      setPill({ top, height: pillH });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIdx]);

  function navigate(href: string, e?: { preventDefault?: () => void }) {
    if (e && typeof document !== "undefined" && "startViewTransition" in document) {
      e.preventDefault?.();
      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      };
      doc.startViewTransition?.(() => router.push(href));
    }
  }

  const RadiusIcon = RADIUS_LAUNCHER.icon;

  // Build the column: Today, Map, [Radius disc], Events, Saved. The disc
  // is inserted before the Events tab (index 2) so the four real tabs
  // keep their indices for the pill measurement.
  const cells: React.ReactNode[] = [];
  TABS.forEach((tab, idx) => {
    if (idx === 2) {
      cells.push(
        <li key="radius-center" className="flex">
          <Link
            href={RADIUS_LAUNCHER.href}
            onPointerDown={() => haptic("medium")}
            onClick={(e) => navigate(RADIUS_LAUNCHER.href, e)}
            aria-label="Open your radius reach"
            className="group relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-full transition-transform active:scale-90"
            style={{ transitionTimingFunction: "var(--app-ease-spring)" }}
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{
                background:
                  "linear-gradient(155deg, var(--app-brand) 0%, var(--clay-deep, #97331F) 100%)",
                boxShadow:
                  "0 6px 14px -6px color-mix(in srgb, var(--app-brand) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.28)",
              }}
            >
              <RadiusIcon
                width={19}
                height={19}
                strokeWidth={2.25}
                style={{ color: "#FBF7EF" }}
                aria-hidden
              />
            </span>
            <span
              className="text-[10.5px] font-semibold leading-none tracking-tight"
              style={{ color: "var(--app-brand)" }}
            >
              {RADIUS_LAUNCHER.label}
            </span>
          </Link>
        </li>,
      );
    }
    const { href, nav, label, icon: Icon, fillOnActive } = tab;
    const isRealActive = pathname === href || pathname.startsWith(href + "/");
    const isPendingActive = pendingIdx === idx;
    const active = isRealActive || isPendingActive;
    const target = nav ?? href;

    cells.push(
      <li
        key={href}
        ref={(el) => {
          tabRefs.current[idx] = el;
        }}
        className="flex"
      >
        <Link
          href={target}
          onPointerDown={() => {
            if (!isRealActive) setPendingIdx(idx);
          }}
          onClick={(e) => {
            if (isRealActive) return;
            setPendingIdx(idx);
            haptic("light");
            navigate(target, e);
          }}
          className="group relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-full text-center transition-transform active:scale-[0.92]"
          style={{
            color: active ? "var(--app-brand)" : "var(--app-ink-3)",
            transitionTimingFunction: "var(--app-ease-spring)",
            transitionDuration: "var(--app-dur-fast)",
          }}
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
            className="text-[10.5px] font-semibold leading-none tracking-tight transition-opacity"
            style={{ opacity: active ? 1 : 0.78 }}
          >
            {label}
          </span>
        </Link>
      </li>,
    );
  });

  return (
    <div
      aria-hidden
      // Hidden below lg, where BottomNav owns small viewports. Fixed to
      // the left edge so it stays put as the content scrolls.
      className="pointer-events-none fixed bottom-0 left-0 top-0 z-40 hidden py-4 pl-3 lg:flex lg:items-center"
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
        {/* Vertical brand pill. The top and height morph between cells
            with the same spring easing as BottomNav's horizontal pill. */}
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
          {cells}
        </ul>
      </nav>
    </div>
  );
}
