import type { ReactNode } from "react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import styles from "./PlaceTownSummary.module.css";

export function countPlaceTowns(places: ReadonlyArray<{ municipality: string }>) {
  const tally = new Map<string, number>();
  for (const place of places) {
    tally.set(place.municipality, (tally.get(place.municipality) ?? 0) + 1);
  }
  return tally;
}

export default function PlaceTownSummary({ tally, label, renderTown }: {
  tally: ReadonlyMap<string, number>; label: string;
  renderTown?: (slug: string, content: ReactNode, count: number) => ReactNode;
}) {
  const known = [...tally].filter(([slug]) => Boolean(MUNICIPALITY_BY_SLUG[slug]))
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b));
  if (known.length < 2) return null;

  const unknown = [...tally].reduce((sum, [slug, count]) => sum + (MUNICIPALITY_BY_SLUG[slug] ? 0 : count), 0);
  const limit = unknown ? 2 : 3;
  const towns: { name: string; count: number; slug?: string }[] = known.slice(0, limit).map(([slug, count]) => ({ slug, name: MUNICIPALITY_BY_SLUG[slug].name, count }));
  const rest = known.slice(limit);
  if (rest.length) {
    towns.push({
      slug: rest.length === 1 ? rest[0][0] : undefined,
      name: rest.length === 1 ? MUNICIPALITY_BY_SLUG[rest[0][0]].name : "Other towns",
      count: rest.reduce((sum, [, count]) => sum + count, 0),
    });
  }
  if (unknown) towns.push({ name: "Town not listed", count: unknown });

  return (
    <figure className={styles.summary}>
      <figcaption>{label}</figcaption>
      <div className={styles.strip} aria-hidden="true">
        {towns.map(({ name, count }, i) => <span key={name} data-tone={i} style={{ flexGrow: count }} />)}
      </div>
      <ul>
        {towns.map(({ name, count, slug }, i) => {
          const content = <>{name} <strong>{count}</strong><span className="sr-only"> {count === 1 ? "place" : "places"}</span></>;
          return <li key={name}>
            <span className={styles.swatch} data-tone={i} aria-hidden="true" />
            {slug && renderTown ? renderTown(slug, content, count) : content}
          </li>;
        })}
      </ul>
    </figure>
  );
}
