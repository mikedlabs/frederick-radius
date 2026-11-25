import type { ReactNode } from "react";
import styles from "./TodayAsk.module.css";

// Symbolic wayfinding illustrations. They depict each tool's purpose, never
// a particular venue, opening time, local route or available facility.
const artwork: Record<"hours" | "essentials" | "outing" | "services", ReactNode> = {
  hours: <>
    <path className={styles.artPaper} d="M18 47V18h66v29z" />
    <path className={styles.artFill} d="M13 18l5-10h65l6 10v4H13z" />
    <path className={styles.artTint} d="M22 18l3-10h9l-2 10zm21 0 1-10h9l1 10zm23 0L64 8h9l3 10z" />
    <path d="M19 22h64M28 47V28h17v19m9-20h21v12H54zM60 27l5-4 5 4M11 48h83" />
    <path className={styles.artFill} d="M32 45V32l10-3v16z" />
    <path d="M57 32h15" />
  </>,
  essentials: <>
    <path className={styles.artPaper} d="M47 6h5v43h-5z" />
    <path className={styles.artFill} d="M28 9h41l8 8-8 8H28z" />
    <path className={styles.artPaper} d="M36 28h36v13H36l-7-6.5z" />
    <path className={styles.artReverse} d="M35 13l2 7 3-5 3 5 2-7m11 1c-6-3-8 7-1 6" />
    <path d="M46 34h12v3m-7-3v-3h5m4 7v1m-29 10h37" />
  </>,
  outing: <>
    <path className={styles.artTint} d="M15 15l23-7 24 7 24-7 3 32-24 8-24-8-23 8z" />
    <path d="M38 8l3 32m21-25 3 33" opacity=".45"/>
    <path className={styles.artTrail} d="M27 35c2-8 11-8 20-7s12-9 25-10" />
    <circle className={styles.artPaper} cx="27" cy="35" r="3.6" />
    <path className={styles.artFill} d="M80 13c0 5-6 11-6 11s-6-6-6-11a6 6 0 1 1 12 0Z" />
    <circle className={styles.artPaper} cx="74" cy="13" r="1.8" />
  </>,
  services: <>
    <path className={styles.artPaper} d="M26 9h41a5 5 0 0 1 5 5v30H28a4 4 0 0 1-4-4V14q0-5 2-5z" />
    <path className={styles.artTint} d="M29 9h8v35h-8z" />
    <path className={styles.artFill} d="M72 15h6v7h-6zm0 16h6v7h-6z" />
    <path d="M45 34h18m-18 4h12M22 46h57"/>
    <path className={styles.artFill} d="M46 16l4-2 3 5-2 2q2 4 6 5l2-3 5 3-2 4c-5 3-17-7-16-14z" />
  </>,
};

export default function PracticalIllustration({ kind }: { kind: keyof typeof artwork }) {
  return <svg className={styles.wayfindingArt} data-tool-illustration={kind} viewBox="0 0 100 56"
    fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    focusable="false" aria-hidden="true">
    {artwork[kind]}
  </svg>;
}
