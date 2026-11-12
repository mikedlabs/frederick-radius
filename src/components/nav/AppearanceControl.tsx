"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { applyAppearance, getAppearance, subscribeAppearance } from "@/lib/appearance";

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
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[var(--app-radius-sm)] transition hover:bg-[var(--app-bg-sunken)]"
      style={{ color: "var(--app-ink)" }}
    >
      {dark ? <Sun size={20} strokeWidth={1.75} aria-hidden /> : <Moon size={20} strokeWidth={1.75} aria-hidden />}
    </button>
  );
}
