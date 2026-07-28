import { getDeckKeys } from "@/lib/deck/readings";
import DeckBoard from "@/components/deck/DeckBoard";

/**
 * The deck's server half: read the instruments, stamp the time, hand the keys
 * to the board. Streamed under a Suspense boundary so the tool index below it
 * paints without waiting on a single feed.
 */

export function DeckSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className="aspect-square animate-pulse"
          style={{
            borderRadius: "var(--app-radius-md)",
            background: "var(--app-ink-tint-08, rgba(34,28,21,0.08))",
          }}
        />
      ))}
    </div>
  );
}

export default async function DeckSection() {
  const now = new Date();
  const keys = await getDeckKeys(now);
  const reporting = keys.filter((key) => key.status === "ok").length;
  const readAt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  return (
    <section aria-labelledby="deck-heading" className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="deck-heading"
          className="font-serif text-[19px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Right now
        </h2>
        {/* Freshness and coverage, in the instrument voice. A board of live
            readings has to say when it was read and how many answered. */}
        <p
          className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.12em] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {readAt} · {reporting}/{keys.length}
        </p>
      </div>
      <DeckBoard keys={keys} />
    </section>
  );
}
