import type { CSSProperties } from "react";
import styles from "./MapLoadingScene.module.css";

export type MapLoadingSceneProps = {
  /** Lets the host preserve its exact map-shell height. */
  height?: CSSProperties["height"];
  /** A complete sentence, shared by the visible and announced status. */
  status?: string;
  className?: string;
  /** First live idle frame has painted; dissolve rather than hard-unmount. */
  ready?: boolean;
};

const DEFAULT_STATUS = "The Frederick County map is loading.";

/**
 * A zero-interaction cold-start scene for Mapbox's JavaScript/style/tiles gap.
 *
 * The linework is intentionally illustrative rather than navigational: Catoctin
 * relief, the Monocacy, and the Radius ripple make the wait feel locally made
 * without implying that a usable map is already on screen.
 */
export default function MapLoadingScene({
  height,
  status = DEFAULT_STATUS,
  className,
  ready = false,
}: MapLoadingSceneProps) {
  const style = height
    ? ({ "--map-loading-height": height } as CSSProperties)
    : undefined;

  return (
    <div
      className={[styles.scene, className].filter(Boolean).join(" ")}
      style={style}
      data-state={ready ? "ready" : "loading"}
      role={ready ? undefined : "status"}
      aria-live={ready ? undefined : "polite"}
      aria-atomic="true"
      aria-busy={ready ? undefined : "true"}
      aria-hidden={ready || undefined}
      aria-label={status}
    >
      <div className={styles.field} aria-hidden="true">
        <svg
          className={styles.linework}
          viewBox="0 0 560 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g className={styles.contours}>
            <path d="M-26 73C42 18 118 21 171 58C221 93 252 84 295 54C348 16 425 7 491 46C533 70 562 74 593 56" />
            <path d="M-24 102C39 52 113 53 161 84C214 120 250 111 302 77C355 42 426 39 486 70C531 94 562 99 593 81" />
            <path d="M-27 132C39 87 101 85 151 113C206 144 247 143 307 107C361 76 423 73 481 100C528 121 559 129 593 112" />
            <path d="M-30 299C48 249 118 255 167 292C217 329 263 330 319 296C376 261 446 257 508 290C542 307 570 310 594 297" />
            <path d="M-30 330C49 284 112 288 158 318C213 355 263 360 326 324C381 293 447 291 507 320C544 338 570 343 594 330" />
          </g>

          <path
            className={styles.ridge}
            d="M48 -14C71 50 56 99 83 147C110 196 93 251 119 304C137 341 132 373 145 418"
          />
          <path
            className={styles.creek}
            d="M406 -18C384 38 414 82 390 126C367 169 405 208 381 254C356 301 385 351 352 418"
          />
          <path
            className={styles.road}
            d="M260 -16C264 58 245 108 269 169C289 220 274 286 298 416"
          />
          <path
            className={styles.route}
            pathLength="1"
            d="M260 -16C264 58 245 108 269 169C289 220 274 286 298 416"
          />

          <g className={styles.radiusMark}>
            <path d="M226 230A54 54 0 0 1 334 230" />
            <path d="M195 230A85 85 0 0 1 365 230" />
            <circle cx="280" cy="230" r="13" />
          </g>
        </svg>

        <span className={styles.countyLabel}>Frederick County</span>
        <span className={styles.coordinates}>39.4143° N&nbsp;&nbsp;77.4105° W</span>
      </div>

      <div className={styles.statusBlock}>
        <span className={styles.eyebrow} aria-hidden="true">
          Radius map
        </span>
        <p className={styles.statusText} aria-hidden="true">
          {status}
        </p>
        <span className={styles.progress} aria-hidden="true">
          <span />
        </span>
      </div>
    </div>
  );
}
