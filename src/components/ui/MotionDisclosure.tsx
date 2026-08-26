"use client";

import type { ReactNode } from "react";

/**
 * Keeps progressive detail spatially connected to its trigger. The shared
 * grid-row transition works with dynamic content, while `inert` keeps closed
 * controls out of the keyboard and screen-reader journey.
 */
export default function MotionDisclosure({
  id,
  open,
  children,
  className = "",
  innerClassName = "",
}: {
  id: string;
  open: boolean;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div
      id={id}
      data-motion-disclosure
      data-state={open ? "open" : "closed"}
      aria-hidden={!open || undefined}
      inert={!open ? true : undefined}
      className={className}
    >
      <div className={`motion-disclosure__inner ${innerClassName}`}>
        {children}
      </div>
    </div>
  );
}
