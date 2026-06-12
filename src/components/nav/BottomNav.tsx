"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { TABS, RADIUS_LAUNCHER, tabIndexForPath } from "./tabs";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Real index from the current route. Falls back to 0 so the slider
  // still has a home on non-primary routes (for example /about,
  // /settings).
  const realIdx = Math.max(0, tabIndexForPath(pathname));

  // Optimistic index. It is set on pointer-down so the indicator slides
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

  // Measure the tab strip and active tab so the indicator pill can sit
  // exactly behind the active chip. It recomputes on resize and on
  // active-tab change. Using a measured pill instead of a CSS-only
  // "100% / 5" calc lets us pad the pill smaller than the tab cell so it
  // reads as a chip behind the icon, not a full-column slab. The center
  // launcher is not a tab, so its column carries no ref and the pill
  // never parks behind it.
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
      const pillW = Math.min(54, cBox.width - 8);
      const left = cBox.left - sBox.left + (cBox.width - pillW) / 2;
      setPill({ left, width: pillW });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIdx]);

  // Shared view-transition push so a tap animates the route change where
  // the browser supports it, and falls back to a plain push otherwise.
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
  const radiusActive =
    pathname === "/map" || pathname.startsWith("/map/");

  // Build the row: Today, Map, [raised center], Events, Saved. The
  // center spacer is inserted before the Events tab (index 2) so the
  // four real tabs keep their indices for the pill measurement.
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
            className="group relative flex h-12 w-full flex-col items-center justify-end gap-1 rounded-full pb-1 text-center"
          >
            <span
              className="text-[10.5px] font-semibold leading-none tracking-tight"
              style={{ color: radiusActive ? "var(--app-brand)" : "var(--app-ink-3)" }}
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
          className="group relative flex h-12 w-full flex-col items-center justify-center gap-1 rounded-full text-center transition-transform active:scale-[0.92]"
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
              transform: active ? "translateY(-1px) scale(1.04)" : "translateY(0)",
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
      // Hide the floating bottom pill at lg+ where the SideRail takes
      // over as the primary nav. Tokenized z-index (--z-nav). Lift the
      // pill above the iOS safe-area inset so the nav clears the home
      // indicator.
      className="pointer-events-none fixed inset-x-0 bottom-0 px-3 lg:hidden"
      style={{
        zIndex: "var(--z-nav)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
      }}
    >
      {/* Relative wrapper is the positioning context for the raised
          launcher. It carries no overflow clip, so the raised circle can
          rise above the bar while the nav below still clips its moving
          pill to the rounded-pill shape. */}
      <div className="pointer-events-auto relative mx-auto max-w-screen-md">
        <nav
          aria-label="Primary"
          className="relative overflow-hidden rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent)",
            backdropFilter: "blur(22px) saturate(1.15)",
            WebkitBackdropFilter: "blur(22px) saturate(1.15)",
            border: "1px solid var(--app-border)",
            boxShadow:
              "0 10px 28px -8px rgba(20,20,18,0.22), 0 2px 6px rgba(20,20,18,0.10), var(--app-edge), var(--app-hi)",
          }}
        >
          {/* Moving brand pill sits behind the active tab's icon. The
              left and width morph between cells with a spring easing. */}
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
            {cells}
          </ul>
        </nav>

        {/* Raised center launcher. It floats above the bar as a sibling
            of the clipped nav so it is never cut off. The brand-filled
            disc is the signature action and reads as the product mark:
            tap it from any screen to open your radius reach. */}
        <Link
          href={RADIUS_LAUNCHER.href}
          onPointerDown={() => haptic("medium")}
          onClick={(e) => navigate(RADIUS_LAUNCHER.href, e)}
          aria-label="Open your radius reach"
          className="absolute left-1/2 grid h-[56px] w-[56px] -translate-x-1/2 place-items-center rounded-full transition-transform active:scale-90"
          style={{
            top: "-16px",
            background:
              "linear-gradient(155deg, var(--app-brand) 0%, var(--clay-deep, #97331F) 100%)",
            boxShadow:
              "0 0 0 4px color-mix(in srgb, var(--app-bg-elevated-solid) 92%, transparent), 0 12px 24px -8px color-mix(in srgb, var(--app-brand) 60%, transparent), 0 4px 10px rgba(20,20,18,0.22), inset 0 1px 0 rgba(255,255,255,0.28)",
            transitionTimingFunction: "var(--app-ease-spring)",
          }}
        >
          <RadiusIcon
            width={24}
            height={24}
            strokeWidth={2.25}
            style={{ color: "#FBF7EF" }}
            aria-hidden
          />
        </Link>
      </div>
    </div>
  );
}
