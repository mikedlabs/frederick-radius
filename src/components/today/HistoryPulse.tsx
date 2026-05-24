import dynamic from "next/dynamic";
import { HISTORY } from "@/data/history";

/**
 * HistoryPulse: the data layer for Today's "Did you know?" section.
 *
 * It selects the fact + moment entries (people have their own lane on
 * /history) and a starting index that rotates once per calendar day,
 * then hands both to HistoryDeck, the interactive card.
 *
 * This stays a server component on purpose: the daily index is
 * computed once on the server, so the client card hydrates from a
 * fixed prop with no date-driven mismatch.
 *
 * HistoryDeck is the heaviest below-the-fold client component on
 * /today (288 lines with swipe/state logic). Loading it via dynamic()
 * code-splits its JS into its own chunk so the initial /today bundle
 * doesn't carry it. Server still renders the markup (ssr stays on by
 * default) so the section is in the SSR HTML and reads correctly to
 * crawlers and screen readers.
 */
const HistoryDeck = dynamic(() => import("./HistoryDeck"));

export default function HistoryPulse() {
  const facts = HISTORY.filter((h) => h.kind === "fact" || h.kind === "moment");
  if (facts.length === 0) return null;

  // Deterministic per calendar day: the card opens on a different
  // entry each day, and the reader can step on from there.
  const dayIndex = Math.floor(new Date().getTime() / 86_400_000);
  const start = ((dayIndex % facts.length) + facts.length) % facts.length;

  return <HistoryDeck facts={facts} start={start} />;
}
