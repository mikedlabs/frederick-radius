import type { CSSProperties } from "react";
import CountyLocator from "./CountyLocator";
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

/** Keep the verified county overview visible until the first native map frame. */
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
        <CountyLocator />
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
