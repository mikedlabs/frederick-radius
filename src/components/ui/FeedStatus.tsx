/**
 * FeedStatus — consolidated feed/layer status indicator for map and data surfaces.
 *
 * Replaces the inline `.map-live-status`, `.map-overlay-loading`, and
 * `.map-overlay-error` classes with a single reusable component that:
 *   - Groups status messages to avoid overlapping chips
 *   - Names the data source when available
 *   - Provides consistent retry UI
 *   - Maintains mobile-friendly hit targets
 *
 * Mobile hierarchy: renders at z-map-control, above the map canvas but below
 * drawers and overlays, so status never obscures selected content.
 */

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { type ReactNode } from "react";

export type FeedStatusType = "loading" | "error" | "stale" | "degraded" | "empty";

export type FeedStatusProps = {
  /** Current status state */
  status: FeedStatusType;
  /** Data source name (e.g. "Live buses", "Weather radar", "TransIT feed") */
  source: string;
  /** Optional detail line (e.g. age, count, reason) */
  detail?: string;
  /** Retry callback for error states */
  onRetry?: () => void;
  /** Additional context for screen readers */
  ariaLabel?: string;
  /** Custom styling class */
  className?: string;
};

export default function FeedStatus({
  status,
  source,
  detail,
  onRetry,
  ariaLabel,
  className = "",
}: FeedStatusProps) {
  const isError = status === "error";
  const isLoading = status === "loading";
  const isStale = status === "stale";
  const isDegraded = status === "degraded";
  const isEmpty = status === "empty";

  // Screen reader label combines status, source, and detail
  const announcement = ariaLabel ?? [
    status === "loading" ? "Loading" :
    status === "error" ? "Error loading" :
    status === "stale" ? "Delayed" :
    status === "degraded" ? "Degraded" :
    "Empty",
    source,
    detail
  ].filter(Boolean).join(" · ");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={announcement}
      className={`feed-status ${className}`.trim()}
      data-status={status}
    >
      <div className="feed-status-content">
        {isLoading && (
          <LoaderCircle
            className="feed-status-icon feed-status-icon-loading"
            aria-hidden
            size={14}
            strokeWidth={2.5}
          />
        )}
        {(isError || isStale || isDegraded) && (
          <AlertTriangle
            className="feed-status-icon"
            aria-hidden
            size={14}
            strokeWidth={2.5}
          />
        )}
        {isEmpty && (
          <span
            className="feed-status-dot"
            aria-hidden
          />
        )}
        <div className="feed-status-text">
          <span className="feed-status-message">
            {status === "loading" && `Loading ${source}`}
            {status === "error" && `${source} unavailable`}
            {status === "stale" && `${source} delayed`}
            {status === "degraded" && `${source} degraded`}
            {status === "empty" && `No ${source} right now`}
          </span>
          {detail && (
            <span className="feed-status-detail">
              {" · "}{detail}
            </span>
          )}
        </div>
      </div>
      {isError && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="feed-status-retry"
          aria-label={`Retry loading ${source}`}
        >
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * FeedStatusGroup — stacks multiple feed statuses without overlap.
 * Use this wrapper when several layers/feeds can report status simultaneously.
 */
export function FeedStatusGroup({ children }: { children: ReactNode }) {
  return (
    <div className="feed-status-group" role="group">
      {children}
    </div>
  );
}
