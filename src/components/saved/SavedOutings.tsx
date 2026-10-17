"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { refreshSavedOutings, removeOuting, savedOutingErrorDescription, type SavedOutingsSnapshot } from "@/hooks/useSavedOutings";
import { savedOutingDetails, savedOutingHref } from "@/lib/saved-outings";
import styles from "./SavedOutings.module.css";

export default function SavedOutings({ snapshot }: { snapshot: SavedOutingsSnapshot }) {
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const [error, setError] = useState<string | null>(null);
  if (snapshot.status === "ready" && snapshot.outings.length === 0) return null;

  async function remove(token: string, button: HTMLButtonElement) {
    const restoreFocus = document.activeElement === button;
    const links = [...(sectionRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-saved-outing-open]") ?? [])];
    const index = links.findIndex((link) => link === button.closest("article")?.querySelector("a[data-saved-outing-open]"));
    const nextHref = (links[index + 1] ?? links[index - 1])?.getAttribute("href");
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(token);
    setError(null);
    try {
      await removeOuting(token);
      toast("The outing was removed from Saved on this device.");
      if (restoreFocus) window.requestAnimationFrame(() => {
        // The confirmed store update removes the old control. Orient keyboard
        // users after React commits, including the last-card empty state.
        if (document.activeElement !== button && document.activeElement !== document.body) return;
        const remaining = [...(sectionRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-saved-outing-open]") ?? [])];
        const target = remaining.find((link) => link.getAttribute("href") === nextHref)
          ?? remaining[0] ?? document.getElementById("saved-page-heading");
        target?.focus();
      });
    } catch (failure) {
      setError(savedOutingErrorDescription(failure));
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  }

  return <section ref={sectionRef} aria-label="Saved outings" className={styles.section} aria-busy={snapshot.status === "loading" || pending !== null}>
    <header className={styles.header}>
      <Bookmark className="h-4 w-4" aria-hidden />
      <h2>Saved outings</h2>
      {snapshot.status === "ready" && <span>{snapshot.outings.length}</span>}
    </header>
    <p className={styles.intro}>Your outings stay on this device. Review current sources and venue hours before visiting.</p>
    {snapshot.status === "loading" && <p className={styles.feedback}>Loading saved outings…</p>}
    {snapshot.status === "unavailable" && <div className={styles.feedback} role="status">
      <p>Radius could not confirm saved outings on this device. Try again to read your saved outings.</p>
      <button type="button" className={styles.retry} onClick={refreshSavedOutings}>Try again</button>
    </div>}
    {error && <p className={styles.feedback} role="alert">{error}</p>}
    <ul className={styles.list}>
      {snapshot.outings.map((outing) => {
        const details = savedOutingDetails(outing.token);
        const href = savedOutingHref(outing.token);
        if (!details || !href) return null;
        return <li key={outing.token}>
          <article className={styles.card}>
            <p className={styles.eyebrow}>Draft outing · {details.town}</p>
            <h3>{outing.title}</h3>
            <p className={styles.metadata}>{details.stopCount} saved {details.stopCount === 1 ? "stop" : "stops"} · {details.dateLabel}</p>
            <div className={styles.actions}>
              <Link href={href} data-saved-outing-open className={styles.open} prefetch={false} aria-label={`Open outing: ${outing.title}`}>Open outing <ArrowRight aria-hidden className="h-4 w-4" /></Link>
              <button type="button" onClick={(event) => remove(outing.token, event.currentTarget)} disabled={pending !== null || snapshot.status !== "ready"} className={styles.remove} aria-label={`Remove outing: ${outing.title}`}>{pending === outing.token ? "Removing…" : "Remove"}</button>
            </div>
          </article>
        </li>;
      })}
    </ul>
  </section>;
}
