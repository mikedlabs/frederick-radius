"use client";

import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { MouseEvent, ReactNode, ElementType, ComponentPropsWithoutRef } from "react";

type MagicCardProps<T extends ElementType = "div"> = {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  as?: T;
} & ComponentPropsWithoutRef<T>;

export function MagicCard<T extends ElementType = "div">({
  children,
  className = "",
  glowColor = "rgba(120, 119, 198, 0.15)", // palette-exempt
  as,
  ...props
}: MagicCardProps<T>) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent<HTMLElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const Component = as || "div";

  return (
    <Component
      className={`group relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)] shadow-sm ${className}`}
      onMouseMove={handleMouseMove}
      style={{ borderColor: "color-mix(in srgb, var(--app-border-strong) 60%, transparent)", ...props.style }}
      {...props}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              400px circle at ${mouseX}px ${mouseY}px,
              ${glowColor},
              transparent 80%
            )
          `,
        }}
      />
      {children}
    </Component>
  );
}
