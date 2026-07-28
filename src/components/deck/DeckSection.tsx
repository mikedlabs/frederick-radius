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

  // The heading and the freshness stamp live inside the board because the
  // board keeps polling after this render, and a server-stamped time would
  // freeze at page load while the numbers under it kept moving.
  return (
    <section aria-labelledby="deck-heading">
      <DeckBoard initialKeys={keys} initialReadAt={now.toISOString()} />
    </section>
  );
}
