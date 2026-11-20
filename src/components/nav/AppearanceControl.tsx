"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { applyAppearance, getAppearance, subscribeAppearance } from "@/lib/appearance";
import styles from "./NavChrome.module.css";

export default function AppearanceControl() {
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearance, () => "light");
  const dark = appearance === "dark";
  const label = dark ? "Switch to light appearance" : "Switch to dark appearance";
  useEffect(() => { applyAppearance(getAppearance(), false); }, []);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => applyAppearance(dark ? "light" : "dark")}
      className={styles.utilityRow}
    >
      {dark ? <Sun size={20} strokeWidth={1.75} aria-hidden /> : <Moon size={20} strokeWidth={1.75} aria-hidden />}
      <span>{label}</span>
    </button>
  );
}
