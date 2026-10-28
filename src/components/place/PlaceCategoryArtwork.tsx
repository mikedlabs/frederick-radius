import type { CSSProperties } from "react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import CategoryIcon from "./CategoryIcon";
import styles from "./NearbyDiscoveryCard.module.css";

/** Decorative identity for a place without eligible photography. This is
 * category artwork, never a photograph, business logo or appearance claim. */
export default function PlaceCategoryArtwork({ name, category, className = "" }: {
  name: string;
  category: string;
  className?: string;
}) {
  const initial = name.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase("en-US") ?? "";
  const color = CATEGORY_BY_SLUG[category]?.color ?? "var(--app-brand)";
  return <span aria-hidden="true" data-place-category-art className={`${styles.categoryArt} ${className}`}
    style={{ "--nearby-category-color": color } as CSSProperties}>
    <span className={styles.categoryInitial}>{initial}</span>
    <CategoryIcon slug={category} className={styles.categoryArtIcon} strokeWidth={1.65} />
  </span>;
}
