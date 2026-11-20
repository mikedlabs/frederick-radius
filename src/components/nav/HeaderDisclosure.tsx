"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./NavChrome.module.css";

/** Native, mutually exclusive header panels. Escape returns to the opener. */
export default function HeaderDisclosure({ name, label, trigger, children }: {
  name: "area" | "tools";
  label: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (ref.current?.open && event.target instanceof Node && !ref.current.contains(event.target)) {
        ref.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return (
    <details ref={ref} name="today-header-controls" data-today-header-disclosure={name} className={styles.todayDisclosure}
      onBlur={event => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next)) event.currentTarget.open = false;
      }}
      onKeyDown={event => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }}>
      <summary data-today-area-trigger={name === "area" || undefined} data-today-tools-trigger={name === "tools" || undefined}
        aria-label={label} title={label} className={styles.todayHeaderTrigger}>
        {trigger}
      </summary>
      <div className={styles.todayHeaderPanel}>{children}</div>
    </details>
  );
}
