import { HISTORY } from "@/data/history";
import HistoryDeck from "./HistoryDeck";

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
 */
export default function HistoryPulse() {
  const facts = HISTORY.filter((h) => h.kind === "fact" || h.kind === "moment");
  if (facts.length === 0) return null;

  // Deterministic per calendar day: the card opens on a different
  // entry each day, and the reader can step on from there.
  const dayIndex = Math.floor(new Date().getTime() / 86_400_000);
  const start = ((dayIndex % facts.length) + facts.length) % facts.length;

  return <HistoryDeck facts={facts} start={start} />;
}
