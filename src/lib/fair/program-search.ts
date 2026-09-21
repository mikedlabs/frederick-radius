export type FairProgramSearchScope = "day" | "all";

type SearchableProgramItem = {
  date: string;
  title: string;
  detail?: string;
  timeLabel: string;
  placeLabel: string;
};

function searchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase()
    .replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Match words across published fields, without guessing missing dates or places. */
export function fairProgramSearchMatches(
  item: SearchableProgramItem,
  query: string,
  selectedDate: string,
  scope: FairProgramSearchScope,
  kindLabel = "",
): boolean {
  if (scope === "day" && item.date !== selectedDate) return false;
  const words = searchText(query).split(" ").filter(Boolean);
  const haystack = searchText(`${item.title} ${item.detail ?? ""} ${kindLabel} ${item.timeLabel} ${item.placeLabel}`);
  return words.every((word) => haystack.includes(word));
}
