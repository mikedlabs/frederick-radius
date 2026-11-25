"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { commitLocationScope } from "@/components/nav/locationScopeNavigation";
import styles from "./CategoryGeography.module.css";

export default function CategoryTownAction({ town, label, children }: { town: string; label: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" className={styles.town} aria-label={label} disabled={pending} onClick={(event) => {
    // The chart disappears after filtering. Leave focus on its permanent town control.
    event.currentTarget.closest("[data-category-geography]")?.querySelector("select")?.focus({ preventScroll: true });
    commitLocationScope(`town:${town}`, {
      refresh: () => startTransition(() => router.refresh()),
      replace: (href, options) => startTransition(() => router.replace(href, options)),
    });
  }}>{children}</button>;
}
