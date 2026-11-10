import type { CSSProperties } from "react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import CategoryIcon from "./CategoryIcon";
import styles from "./NearbyDiscoveryCard.module.css";

/** Stand-in for a place without eligible photography: a flat plate with the
 * category icon. It says what kind of place this is and nothing about how the
 * place looks. It is never a photograph, a business logo or a monogram. */
export default function PlaceCategoryArtwork({ category, className = "" }: {
  category: string;
  className?: string;
}) {
  const color = CATEGORY_BY_SLUG[category]?.color ?? "var(--app-brand)";
  return <span aria-hidden="true" data-place-category-art className={`${styles.categoryArt} ${className}`}
    style={{ "--place-category-color": color } as CSSProperties}>
    <CategoryIcon slug={category} className={styles.categoryArtIcon} strokeWidth={1.65} />
  </span>;
}
