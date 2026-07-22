"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import type { MapDiscovery } from "./mapDiscoveries";

function evidenceCue(item: MapDiscovery["evidence"][number]): string | null {
  const parts: string[] = [];
  if (item.precision === "approximate") parts.push("Approximate point");
  else if (item.precision === "exact") parts.push("Recorded point");
  else if (item.precision === "area") parts.push("Area-level");
  if (item.observedAt) {
    const date = new Date(item.observedAt);
    if (Number.isFinite(date.getTime())) {
      parts.push(new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date));
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function MapDiscoveryPeek({
  discovery,
  index,
  total,
  onPrevious,
  onNext,
  onClose,
}: {
  discovery: MapDiscovery;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    regionRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div ref={regionRef} className="map-finding-peek" role="region" tabIndex={-1} aria-labelledby={titleId}>
      <div className="map-finding-topline">
        <span className="map-finding-index">{index + 1} of {total}</span>
        <div className="map-finding-nav" role="group" aria-label="Browse map findings">
          <button type="button" className="map-finding-nav-btn tap-44" onClick={onPrevious} aria-label="Previous finding">
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
          <button type="button" className="map-finding-nav-btn tap-44" onClick={onNext} aria-label="Next finding">
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
          <button type="button" className="map-finding-nav-btn tap-44" onClick={onClose} aria-label="Close finding">
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      </div>

      <span className="map-finding-eyebrow">{discovery.eyebrow}</span>
      <h2 id={titleId} className="map-finding-title font-serif">{discovery.title}</h2>
      <p className="map-finding-summary">{discovery.summary}</p>

      <div className="map-finding-actions">
        <details className="map-finding-proof">
          <summary onClick={() => track("map_finding", { pick: "why", kind: discovery.kind })}>
            <Info className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            Why this appeared
          </summary>
          <ul>
            {discovery.evidence.map((item, itemIndex) => (
              <li key={`${item.fact}:${itemIndex}`}>
                <span>{item.fact}</span>
                <small>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      className="underline underline-offset-2"
                      {...(item.sourceUrl.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                    >
                      {item.source}
                    </a>
                  ) : item.source}
                  {evidenceCue(item) && <> · {evidenceCue(item)}</>}
                </small>
              </li>
            ))}
          </ul>
        </details>
        {discovery.href && discovery.actionLabel && (
          <Link
            href={discovery.href}
            className="map-finding-open"
            onClick={() => {
              haptic("light");
              track("map_finding", { pick: "open", kind: discovery.kind });
            }}
          >
            {discovery.actionLabel}
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
