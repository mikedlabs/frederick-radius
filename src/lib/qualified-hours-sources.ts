/** Reviewed display-only owners. Identity survives slim pins and evidence expiry
 * so an older curated window cannot restore a general opening claim. */
export const QUALIFIED_HOURS_SOURCES = [
  { slug: "national-museum-civil-war-medicine-frederick", name: "National Museum of Civil War Medicine", ledger_id: "museum_civil_war_medicine_hours", category: "museum", url: "https://www.civilwarmed.org/", kind: "weekly" },
  { slug: "the-tasting-room-frederick", name: "The Tasting Room", ledger_id: "tasting_room_hours", category: "restaurant", url: "https://trrestaurant.com/", kind: "weekly" },
  { slug: "hootch-and-banter-frederick", name: "Hootch & Banter", ledger_id: "hootch_banter_hours", category: "restaurant", url: "https://hootchandbanter.com", kind: "weekly" },
  {
    slug: "monocacy-brewing-frederick", name: "Monocacy Brewing Company", ledger_id: "monocacy_taproom_hours", category: "brewery", url: "https://monocacybrewing.com/", kind: "weekly",
    qualification: { scope: "bar", label: "Taproom hours", note: "These are public taproom hours. Brewery operations and tours may differ.", usage: "display_only" },
  },
] as const;

export function hasQualifiedHoursOwner(slug: string | undefined): boolean {
  return QUALIFIED_HOURS_SOURCES.some((source) => source.slug === slug);
}
