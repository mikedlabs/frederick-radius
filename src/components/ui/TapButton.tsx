"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import Link from "next/link";
import { forwardRef } from "react";
import { haptic } from "@/lib/haptics";

/**
 * Spring-feel button: scales down on press, springs back on release.
 * Matches the "tactile" feel of native apps. Honors reduced motion via Framer.
 *
 * Use as a regular button OR pass `href` to render as a Next/Link.
 */
type CommonProps = {
  href?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

type MotionButtonProps = Omit<HTMLMotionProps<"button">, "ref"> & CommonProps;

const TapButton = forwardRef<HTMLButtonElement, MotionButtonProps>(function TapButton(
  { href, children, className = "", style, ...rest },
  ref
) {
  const motionProps = {
    whileTap: { scale: 0.96 },
    whileHover: { scale: 1.015 },
    onTapStart: () => haptic("light"),
    transition: { type: "spring", stiffness: 420, damping: 26 } as const,
  };

  if (href) {
    return (
      <motion.span {...motionProps} className="inline-flex">
        <Link href={href} className={className} style={style}>
          {children}
        </Link>
      </motion.span>
    );
  }

  return (
    <motion.button
      ref={ref}
      type="button"
      {...motionProps}
      {...rest}
      style={style}
      className={className}
    >
      {children}
    </motion.button>
  );
});

export default TapButton;
