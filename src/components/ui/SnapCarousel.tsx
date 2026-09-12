"use client";

import { ReactNode } from "react";

export function SnapCarousel({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`snap-carousel-container flex w-full gap-4 overflow-x-auto pb-6 pt-4 px-6 snap-x snap-mandatory ${className}`}
      style={{
        ...style,
        scrollbarWidth: "none", // Firefox
        msOverflowStyle: "none", // IE
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .snap-carousel-container::-webkit-scrollbar {
          display: none;
        }

        @keyframes snap-carousel-scale {
          0% {
            transform: scale(0.9) translateY(4px);
            opacity: 0.7;
          }
          50% {
            transform: scale(1) translateY(0);
            opacity: 1;
            box-shadow: var(--app-shadow-2);
          }
          100% {
            transform: scale(0.9) translateY(4px);
            opacity: 0.7;
          }
        }

        @supports (animation-timeline: view(inline)) {
          .snap-carousel-item {
            animation: snap-carousel-scale auto linear both;
            animation-timeline: view(inline);
            animation-range: entry -20% exit 120%; 
          }
        }
      `}} />
      {children}
    </div>
  );
}

export function SnapCarouselItem({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`snap-carousel-item snap-center shrink-0 transition-transform ${className}`}
      style={{
        ...style,
        /* Provide a gentle default transition for browsers without animation-timeline support */
        transition: "transform 0.3s ease, opacity 0.3s ease",
      }}
    >
      {children}
    </div>
  );
}
