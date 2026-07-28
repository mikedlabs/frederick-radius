"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { TABS, tabIndexForPath } from "./tabs";
import { useHideOnScroll } from "./useHideOnScroll";

export function shouldShowBottomNav(
  pathname: string,
  contextualActionBarPresent = false,
): boolean {
  return !pathname.startsWith("/ask") && !contextualActionBarPresent;
}

/**
 * Mobile primary navigation as a compact field-guide index strip.
 *
 * The destinations remain conventional, but the floating glass capsule,
 * glowing center orb, and animated selection pill have been retired. A brick
 * registration rule now marks the active chapter. Search lives in the top bar,
 * leaving this strip to hold four stable destinations.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const hidden = useHideOnScroll(false);
  const realIdx = tabIndexForPath(pathname);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pathname completion clears the optimistic destination
    setPendingIdx(null);
  }, [pathname]);

  if (!shouldShowBottomNav(pathname)) return null;

  return (
    <>
      {/* CSS owns the streamed-page handoff: as soon as a contextual bar
          appears, the normal nav is not painted or exposed to assistive tech.
          It stays in the React tree so a streamed detail-to-list transition
          cannot strand the next page without primary navigation. */}
      <style>{`
        @media (max-width: 63.999rem) {
          html:has([data-mobile-action-bar]) [data-bottom-nav-shell] {
            display: none;
          }
        }
      `}</style>
      <div
        data-bottom-nav-shell
        className="pointer-events-none fixed inset-x-0 bottom-0 lg:hidden"
        style={{
          zIndex: "var(--z-nav)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
          paddingLeft: "max(0.5rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(0.5rem, env(safe-area-inset-right, 0px))",
          transform: hidden
            ? "translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 12px))"
            : "translateY(0)",
          transition: "transform var(--app-dur-med) var(--app-ease-out)",
          willChange: "transform",
        }}
      >
        <nav
          aria-label="Primary"
          className="pointer-events-auto relative mx-auto max-w-screen-md overflow-hidden rounded-[var(--app-radius-lg)]"
          style={{
            background: "var(--app-bg-elevated-solid)",
            border: "1px solid var(--app-border-strong)",
            boxShadow: "var(--app-elev-2)",
          }}
        >
          <ul className="mx-auto grid max-w-screen-md grid-cols-4 px-1 py-1">
            {TABS.map(({ href, label, icon: Icon, prefetch, fillOnActive }, idx) => {
              const isAtDestination = pathname === href || pathname.startsWith(`${href}/`);
              const isRealActive = realIdx === idx;
              const active = isRealActive || pendingIdx === idx;

              const handleActivate = (event: React.MouseEvent<HTMLAnchorElement>) => {
                if (isAtDestination) return;
                setPendingIdx(idx);
                haptic("light");
                if (typeof document !== "undefined" && "startViewTransition" in document) {
                  event.preventDefault();
                  const doc = document as Document & {
                    startViewTransition?: (callback: () => void) => unknown;
                  };
                  doc.startViewTransition?.(() => router.push(href));
                }
              };

              return (
                <li key={href} className="flex">
                  <Link
                    href={href}
                    prefetch={prefetch}
                    onPointerDown={() => {
                      if (!isAtDestination) setPendingIdx(idx);
                    }}
                    onClick={handleActivate}
                    aria-current={isRealActive ? "page" : undefined}
                    className="relative flex h-12 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--app-radius-sm)] text-center transition-transform duration-[var(--app-dur-med)] ease-[var(--app-ease-spring)] active:scale-[0.92] active:duration-150 active:ease-[var(--app-ease-out)]"
                    style={{
                      color: active ? "var(--app-brand-press)" : "var(--app-ink-3)",
                      background: active ? "var(--app-brand-tint-6)" : "transparent",
                    }}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-x-2 top-0 h-[2px]"
                      style={{ background: active ? "var(--app-brand)" : "transparent" }}
                    />
                    <Icon
                      width={20}
                      height={20}
                      strokeWidth={active ? 2.25 : 2}
                      fill={active && fillOnActive ? "currentColor" : "none"}
                      aria-hidden
                    />
                    <span className="text-[11px] font-medium leading-tight tracking-tight">
                      {label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
