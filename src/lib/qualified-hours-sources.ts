/** Reviewed display-only owners. Identity survives slim pins and evidence expiry
 * so an older curated window cannot restore a general opening claim. */
export const QUALIFIED_HOURS_SOURCES = [
  { slug: "national-museum-civil-war-medicine-frederick", name: "National Museum of Civil War Medicine", ledger_id: "museum_civil_war_medicine_hours", category: "museum", url: "https://www.civilwarmed.org/", kind: "weekly" },
  { slug: "the-tasting-room-frederick", name: "The Tasting Room", ledger_id: "tasting_room_hours", category: "restaurant", url: "https://trrestaurant.com/", kind: "weekly" },
  { slug: "hootch-and-banter-frederick", name: "Hootch & Banter", ledger_id: "hootch_banter_hours", category: "restaurant", url: "https://hootchandbanter.com", kind: "weekly" },
] as const;

export function hasQualifiedHoursOwner(slug: string | undefined): boolean {
  return QUALIFIED_HOURS_SOURCES.some((source) => source.slug === slug);
}
