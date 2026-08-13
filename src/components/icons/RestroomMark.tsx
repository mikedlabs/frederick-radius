import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/**
 * A compact civic WC sign for public-restroom actions. The literal fixture
 * icon felt illustrative at mobile size; this reads like familiar wayfinding
 * and stays legible beside the Radius map's other infrastructure marks.
 */
const RestroomMark = forwardRef<SVGSVGElement, LucideProps>(
  function RestroomMark(
    {
      color = "currentColor",
      size = 24,
      strokeWidth = 2,
      absoluteStrokeWidth,
      children,
      ...props
    },
    ref,
  ) {
    const numericSize = typeof size === "number" ? size : 24;
    const numericStroke = typeof strokeWidth === "number" ? strokeWidth : 2;
    const resolvedStroke = absoluteStrokeWidth
      ? (numericStroke * 24) / numericSize
      : strokeWidth;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={resolvedStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <rect x="2.75" y="3.75" width="18.5" height="16.5" rx="3.5" />
        <path d="M6 8.5 7.25 15.5 9 11.25l1.75 4.25L12 8.5" />
        <path d="M18.25 10a3 3 0 1 0 0 4" />
        {children}
      </svg>
    );
  },
);

RestroomMark.displayName = "RestroomMark";

export default RestroomMark;
