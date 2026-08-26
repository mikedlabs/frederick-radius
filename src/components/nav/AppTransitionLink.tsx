"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

function canAnimateNavigation(event: MouseEvent<HTMLAnchorElement>): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.currentTarget.target === "_blank" ||
    event.currentTarget.hasAttribute("download")
  ) {
    return false;
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A normal Next link with the shared, main-content-only route handoff. */
export default function AppTransitionLink({
  href,
  onClick,
  ...props
}: Props) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!canAnimateNavigation(event) || !("startViewTransition" in document)) {
          return;
        }
        event.preventDefault();
        const doc = document as Document & {
          startViewTransition?: (callback: () => void) => unknown;
        };
        doc.startViewTransition?.(() => router.push(href));
      }}
      {...props}
    />
  );
}
