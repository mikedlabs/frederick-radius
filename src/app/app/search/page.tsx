import ComingSoon from "@/components/today/ComingSoon";
export const metadata = { title: "Search" };
export default function SearchPage() {
  return (
    <ComingSoon
      title="Search"
      description="Fast, forgiving, local-aware search across places, events, guides, and categories. Postgres FTS + trigram + distance scoring at MVP. Phase 2 (Sprints 5–6)."
    />
  );
}
