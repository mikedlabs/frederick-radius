"use client";

import { useId, useRef, useState } from "react";
import { Bookmark, Check } from "lucide-react";
import { toast } from "sonner";
import { decodeSavedPlanToken } from "@/lib/plan/plan-token";
import { refreshSavedOutings, removeOuting, saveOuting, savedOutingErrorDescription, useSavedOutings } from "@/hooks/useSavedOutings";
import styles from "./SavedOutings.module.css";

export default function SaveOutingButton({ token, title, disabled = false }: { token: string; title: string; disabled?: boolean }) {
  const saved = useSavedOutings();
  const isSaved = saved.outings.some((outing) => outing.token === token);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ saved: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const descriptionId = useId();
  const valid = Boolean(decodeSavedPlanToken(token)?.s.length);

  async function change() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (isSaved) await removeOuting(token);
      else await saveOuting(token, title);
      const confirmation = { saved: !isSaved, text: isSaved ? "Removed from Saved on this device." : "Saved on this device. Open this outing from Saved." };
      setMessage(confirmation);
      toast(confirmation.text);
    } catch (failure) {
      setError(savedOutingErrorDescription(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return <div className={styles.saveControl}>
    <button type="button" onClick={change} disabled={disabled || busy || saved.status !== "ready" || !valid}
      aria-busy={busy} aria-pressed={saved.status === "ready" ? isSaved : undefined}
      aria-label={saved.status === "unavailable" ? "Saved outing state unavailable" : isSaved ? "Remove outing from Saved" : "Save outing"} aria-describedby={descriptionId}
      className={styles.saveButton} data-outing-saved={isSaved ? "true" : "false"}>
      {isSaved ? <Check aria-hidden className="h-4 w-4" /> : <Bookmark aria-hidden className="h-4 w-4" />}
      {saved.status === "unavailable" ? "Save unavailable" : busy ? isSaved ? "Removing…" : "Saving…" : isSaved ? "Saved outing" : "Save outing"}
    </button>
    <p id={descriptionId} className="sr-only">This outing stays on this device. Saving does not confirm current venue hours.</p>
    {message && saved.status === "ready" && message.saved === isSaved && <p role="status" className="sr-only">{message.text}</p>}
    {error && <p role="alert" className={styles.feedback}>{error}</p>}
    {!valid && <p className={styles.feedback}>Choose a stop before saving this outing.</p>}
    {saved.status === "unavailable" && <div className={styles.feedback}>
      <p>Radius could not confirm saved outings on this device.</p>
      <button type="button" onClick={refreshSavedOutings} disabled={disabled || busy} className={styles.retry}>Try again</button>
    </div>}
  </div>;
}
