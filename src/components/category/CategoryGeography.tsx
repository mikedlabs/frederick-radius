import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import ScopeBar from "@/components/nav/ScopeBar";
import PlaceTownSummary, { countPlaceTowns } from "@/components/places/PlaceTownSummary";
import CategoryTownAction from "./CategoryTownAction";
import styles from "./CategoryGeography.module.css";

export default function CategoryGeography({ places, current, selectedTown, openNow }: {
  places: ReadonlyArray<{ municipality: string }>;
  current: string | null;
  selectedTown: string | null;
  openNow?: number;
}) {
  const tally = countPlaceTowns(places);
  const named = [...tally.keys()].filter((slug) => MUNICIPALITY_BY_SLUG[slug]);
  const area = selectedTown ? MUNICIPALITY_BY_SLUG[selectedTown]?.name
    : tally.size === 1 && named.length === 1 ? MUNICIPALITY_BY_SLUG[named[0]].name : undefined;
  const count = `${places.length} ${places.length === 1 ? "listing" : "listings"}`;
  const scope = area ? ` in ${area}` : named.length > 1 ? " by area" : "";
  const caption = `${count}${scope}${openNow ? ` · ${openNow} open now` : ""}`;
  return <div data-category-geography className={styles.geography}>
    {named.length > 1 && !selectedTown ? <PlaceTownSummary tally={tally} label={caption}
      renderTown={(slug, content, count) => <CategoryTownAction town={slug}
        label={`Show ${count} ${count === 1 ? "listing" : "listings"} in ${MUNICIPALITY_BY_SLUG[slug].name}`}>
        {content}
      </CategoryTownAction>} /> : <p className={styles.caption}>{caption}</p>}
    <ScopeBar current={current} selectedTown={selectedTown}
      municipalities={MUNICIPALITIES.map(({ slug, name }) => ({ slug, name }))} />
  </div>;
}
