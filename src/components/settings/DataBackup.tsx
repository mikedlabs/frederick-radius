"use client";

import { useRef, useState } from "react";
import { Download, Upload, Check } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/Button";
import { SettingsRow, SettingsSection } from "@/components/settings/SettingsSection";

/**
 * DataBackup: the escape hatch for device-only data.
 *
 * A signed-out user's saves, passport stamps, notes, and home town live
 * only in this browser's storage, and browsers may clear that without
 * asking (iOS Safari does after about seven idle days). Signing in
 * syncs saved places only. This section protects the remaining local data
 * with a file the user can download and restore on any device.
 *
 * The file is plain JSON of the app's own localStorage keys (fr:*),
 * nothing more: readable, inspectable, no account required.
 */
const PREFIXES = ["fr:", "fr.", "fr-"];
const FORMAT = "frederick-radius-backup";
const VERSION = 1;

function collect(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !PREFIXES.some((p) => key.startsWith(p))) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

export default function DataBackup() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [done, setDone] = useState<"exported" | "restored" | "error" | null>(null);

  function exportBackup() {
    haptic("light");
    try {
      const payload = {
        format: FORMAT,
        version: VERSION,
        exportedAt: new Date().toISOString(),
        data: collect(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${FORMAT}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setDone("exported");
    } catch {
      setDone("error");
    }
  }

  async function restoreBackup(file: File) {
    haptic("light");
    try {
      const parsed = JSON.parse(await file.text()) as {
        format?: string;
        data?: Record<string, unknown>;
      };
      if (parsed.format !== FORMAT || !parsed.data || typeof parsed.data !== "object") {
        setDone("error");
        return;
      }
      let wrote = 0;
      for (const [key, value] of Object.entries(parsed.data)) {
        // Only the app's own keys, only strings, so a hand-edited or
        // foreign file can't plant anything outside the fr:* namespace.
        if (!PREFIXES.some((p) => key.startsWith(p))) continue;
        if (typeof value !== "string") continue;
        window.localStorage.setItem(key, value);
        wrote++;
      }
      if (wrote === 0) {
        setDone("error");
        return;
      }
      setDone("restored");
      // Stores read at mount; a reload is the honest way to show the
      // restored state everywhere at once.
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setDone("error");
    }
  }

  return (
    <SettingsSection title="Your data" ariaLabel="Back up your data">
      <SettingsRow>
        <p className="text-[1rem] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Most personal data stays on this device. Signing in syncs saved places,
          but events and everything else still need a backup file. Browsers can
          clear local storage without asking.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportBackup}
            // The label may wrap: with enlarged text a one-line button is wider
            // than a 320px screen. The height grows with it, so a second line
            // stays inside the button instead of spilling past a fixed 44px.
            className="h-auto min-h-11 max-w-full whitespace-normal py-2 text-left text-[0.875rem]"
            iconLeft={<Download className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
          >
            Download backup
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            // The label may wrap: with enlarged text a one-line button is wider
            // than a 320px screen. The height grows with it, so a second line
            // stays inside the button instead of spilling past a fixed 44px.
            className="h-auto min-h-11 max-w-full whitespace-normal py-2 text-left text-[0.875rem]"
            iconLeft={<Upload className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
          >
            Restore from file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose a backup file to restore"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void restoreBackup(file);
              e.target.value = "";
            }}
          />
          {done === "exported" && (
            <span className="inline-flex items-center gap-1 text-[0.875rem] font-medium" style={{ color: "var(--app-forest-text)" }}>
              <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Backup downloaded
            </span>
          )}
          {done === "restored" && (
            <span className="inline-flex items-center gap-1 text-[0.875rem] font-medium" style={{ color: "var(--app-forest-text)" }}>
              <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Restored, reloading
            </span>
          )}
          {done === "error" && (
            <span className="text-[0.875rem] font-medium" style={{ color: "var(--app-danger-text)" }}>
              That file did not look like a Radius backup.
            </span>
          )}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
