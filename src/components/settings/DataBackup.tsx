"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/Button";
import { SettingsRow, SettingsSection } from "@/components/settings/SettingsSection";
import { applyBackup, BACKUP_FORMAT, BACKUP_VERSION, collectBackup, readBackup, reviewBackup, type BackupReview } from "./data-backup";

type Notice = { error?: boolean; message: string };
const backupButton = "h-auto min-h-11 max-w-full whitespace-normal py-2 text-left text-[0.875rem]";
const storageError = "Your browser couldn’t save the backup. Your previous data is intact. Allow site storage or free up space, then try again.";

export default function DataBackup() {
  const fileRef = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState<{ name: string; review: BackupReview } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (pending) reviewHeading.current?.focus();
  }, [pending]);

  function exportBackup() {
    haptic("light");
    try {
      const payload = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data: collectBackup(window.localStorage),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${BACKUP_FORMAT}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setNotice({ message: "Your backup has downloaded." });
    } catch {
      setNotice({ error: true, message: "The backup could not be downloaded. Allow site storage and downloads, then try again." });
    }
  }

  async function selectFile(file: File) {
    const request = ++selection.current;
    setPending(null);
    setNotice({ message: "We’re reading your backup file." });
    let data: Record<string, string> | null;
    try {
      data = readBackup(await file.text());
    } catch {
      data = null;
    }
    if (selection.current !== request) return;
    if (!data) {
      setNotice({ error: true, message: "Choose a Frederick Radius backup with supported data. Use a JSON file saved with Download backup." });
      return;
    }
    try {
      const review = reviewBackup(window.localStorage, data);
      setPending({ name: file.name, review });
      setNotice(null);
    } catch {
      setNotice({ error: true, message: "Your browser blocked access to device storage. Allow site storage, then choose the file again." });
    }
  }

  const hasChanges = pending && pending.review.added + pending.review.replaced > 0;

  function cancelReview() {
    setPending(null);
    setNotice({ message: "Restore canceled. Your data is unchanged." });
    chooseButton.current?.focus();
  }

  function confirmRestore() {
    if (!pending || restored) return;
    try {
      const result = applyBackup(window.localStorage, pending.review);
      if (result.status === "changed") {
        setPending({ name: pending.name, review: result.review });
        setNotice({ message: "Your device data changed. Review the updated counts before confirming." });
      } else if (result.status === "restored") {
        setPending(null);
        setRestored(true);
        setNotice({ message: "Your backup is restored. Refreshing this page." });
        window.setTimeout(() => window.location.reload(), 600);
      } else if (result.status === "rollback-error") {
        setPending(null);
        setNotice({ error: true, message: "Your browser interrupted the restore and could not undo every change. Keep the backup file, allow storage, then choose the file again." });
      } else {
        setNotice({ error: true, message: storageError });
      }
    } catch {
      setNotice({ error: true, message: storageError });
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
            className={backupButton}
            iconLeft={<Download className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
          >
            Download backup
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className={backupButton}
            disabled={restored}
            onClick={(event) => {
              chooseButton.current = event.currentTarget;
              fileRef.current?.click();
            }}
            iconLeft={<Upload className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
          >
            Restore from file
          </Button>
          <input
            ref={fileRef}
            type="file"
            tabIndex={-1}
            disabled={restored}
            accept="application/json,.json"
            className="hidden"
            aria-label="Choose a backup file to restore"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void selectFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {pending && (
          <div className="mt-4 space-y-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
            <h3 ref={reviewHeading} tabIndex={-1} className="text-[17px] font-semibold">Review your backup</h3>
            <p className="break-words text-[14px]"><strong>{pending.name}</strong></p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-[14px] tabular-nums">
              <dt>New entries</dt><dd>{pending.review.added}</dd>
              <dt>Existing entries to replace</dt><dd>{pending.review.replaced}</dd>
              <dt>Already match this device</dt><dd>{pending.review.unchanged}</dd>
            </dl>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {hasChanges
                ? "An entry can contain a whole list, such as your saved places. Other entries on this device will stay as they are."
                : "The backup already matches this device."}
            </p>
            <div className="flex flex-wrap gap-2">
              {hasChanges && (
                <Button size="sm" className={backupButton} onClick={confirmRestore}>Confirm restore</Button>
              )}
              <Button size="sm" variant="secondary" className={backupButton} onClick={cancelReview}>Cancel</Button>
            </div>
          </div>
        )}
        {notice && <p role={notice.error ? "alert" : "status"} className="mt-2 text-[14px] font-medium" style={{ color: notice.error ? "var(--app-danger-text)" : "var(--app-ink-2)" }}>{notice.message}</p>}
      </SettingsRow>
    </SettingsSection>
  );
}
