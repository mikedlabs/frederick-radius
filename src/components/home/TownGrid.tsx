import Link from "next/link";
import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * The twelve municipalities, each an equal-weight tile. Every town gets
 * the same visual treatment regardless of how much data it has, so the
 * county-wide promise reads as twelve real places, not one city plus
 * footnotes.
 */
export default function TownGrid() {
  return (
    <section className="space-y-2">
      <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
        Browse by town
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MUNICIPALITIES.map((m) => (
          <li key={m.slug}>
            <Link
              href={`/m/${m.slug}`}
              className="flex h-full flex-col gap-0.5 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)] transition hover:shadow-[var(--app-shadow-2)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span className="font-serif text-[15px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                {m.name}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
                {m.type}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
