"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { TABS, tabIndexForPath } from "./tabs";

type NavigationGesture = Pick<
  MouseEvent,
  "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export function isPlainPrimaryNavigation(event: NavigationGesture): boolean {
  return event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}

export function shouldShowBottomNav(
  _pathname: string,
  contextualActionBarPresent = false,
): boolean {
  return !contextualActionBarPresent;
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
        data-map-bottom-nav={pathname === "/map" ? "true" : undefined}
        className="pointer-events-none fixed inset-x-0 bottom-0 lg:hidden"
        style={{
          zIndex: "var(--z-nav)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
          paddingLeft: "max(0.5rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(0.5rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <nav
          aria-label="Primary"
          className="pointer-events-auto relative mx-auto max-w-screen-md overflow-hidden rounded-t-[var(--app-radius-md)]"
          style={{
            background: "var(--app-bg-elevated-solid)",
            border: "1px solid var(--app-border-strong)",
            boxShadow: "0 -8px 28px rgba(34, 28, 21, 0.08)",
          }}
        >
          <ul className="mx-auto grid max-w-screen-md grid-cols-4 px-1 py-1">
            {TABS.map(({ href, label, icon: Icon, prefetch, fillOnActive }, idx) => {
              const isAtDestination = pathname === href || pathname.startsWith(`${href}/`);
              const isRealActive = realIdx === idx;
              const active = isRealActive || pendingIdx === idx;

              const handleActivate = (event: React.MouseEvent<HTMLAnchorElement>) => {
                if (isAtDestination || !isPlainPrimaryNavigation(event.nativeEvent)) {
                  setPendingIdx(null);
                  return;
                }
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
                    onPointerDown={(event) => {
                      if (
                        !isAtDestination
                        && isPlainPrimaryNavigation(event.nativeEvent)
                      ) {
                        setPendingIdx(idx);
                      }
                    }}
                    onPointerCancel={() => setPendingIdx(null)}
                    onPointerLeave={(event) => {
                      // Pointer cancellation is not guaranteed for a mouse
                      // drag that leaves the link. Clear the optimistic mark
                      // without affecting an ordinary post-click hover exit.
                      if (event.buttons !== 0) setPendingIdx(null);
                    }}
                    onClick={handleActivate}
                    aria-current={isAtDestination ? "page" : undefined}
                    className="relative flex h-12 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--app-radius-sm)] text-center transition-[color,transform] duration-[var(--app-dur-fast)] ease-[var(--app-ease-out)] active:scale-[0.97]"
                    style={{
                      color: active ? "var(--app-brand-press)" : "var(--app-ink-3)",
                      background: "transparent",
                    }}
                  >
                    <span
                      aria-hidden
                      className="absolute left-1/2 top-0 h-[2px] w-7 -translate-x-1/2"
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
