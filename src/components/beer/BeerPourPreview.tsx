"use client";

import type { CSSProperties } from "react";
import styles from "./BeerTaproomBoard.module.css";

export default function BeerPourPreview({ color }: { color: string }) {
  return (
    <span
      className={styles.tastingGlass}
      style={{ "--tap-pour": color } as CSSProperties}
      aria-hidden
    >
      <span className={styles.tastingGlassFill} />
      <span className={styles.tastingGlassFoam} />
    </span>
  );
}
