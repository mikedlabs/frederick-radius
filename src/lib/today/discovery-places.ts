import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { placeCardPhotoPlan, type PlaceCardPhotoPlan } from "@/lib/place-card-photo";
import { parseScope, scopeTownSlug, type Scope } from "@/lib/scope";

type DiscoveryIdentity = {
  slug: string;
  name: string;
  shortName?: string;
  municipality: string;
  countyLead?: true;
};

/** Exact canonical catalog identities with independently accepted, bundled
 * scenic photographs. The county has two deliberate editorial leads; other
 * lenses select only their own reviewed identities, without radius guesses,
 * provider calls, an arbitrary result cap or relabeling a nearby town. Short
 * captions retain a full canonical accessible name on the destination link. */
export const LOCAL_DISCOVERY_IDENTITIES: readonly DiscoveryIdentity[] = [
  { slug: "joseph-dill-baker-memorial-carillon-bell-tower", name: "Joseph Dill Baker Memorial Carillon Bell Tower", shortName: "Baker Park Carillon", municipality: "frederick", countyLead: true },
  { slug: "sophie-madigans-playground-frederick", name: "Sophie & Madigan's Playground", municipality: "frederick", countyLead: true },
  { slug: "historic-utica-covered-bridge-thurmont", name: "Historic Utica Covered Bridge", municipality: "thurmont" },
  { slug: "catoctin-mountain-park", name: "Catoctin Mountain Park", municipality: "thurmont" },
  { slug: "co-canal-lock-30-brunswick", name: "C&O Canal Lock 30", municipality: "brunswick" },
  { slug: "fountain-rock-nature-center-walkersville", name: "Fountain Rock Nature Center", municipality: "walkersville" },
  { slug: "new-market-historic-district-new-market", name: "New Market Historic District", municipality: "new-market" },
  { slug: "mount-st-marys-university-emmitsburg", name: "Mount St. Mary's University", municipality: "emmitsburg" },
  { slug: "middletown-park-middletown", name: "Middletown Park", municipality: "middletown" },
];

export type LocalDiscoveryPlace = Omit<DiscoveryIdentity, "countyLead"> & {
  town: string;
  photoPlan: PlaceCardPhotoPlan;
};

/** Resolve one independently accepted scenic identity. Saved places may
 * reuse these exact photographs without borrowing another town's identity. */
export function localDiscoveryPlace(slug: string): LocalDiscoveryPlace | null {
  const place = LOCAL_DISCOVERY_IDENTITIES.find(candidate => candidate.slug === slug);
  if (!place) return null;
  const plan = placeCardPhotoPlan({ slug: place.slug }, 400);
  const sources = plan.sources.filter(source => source.kind !== "google"
    && source.src.startsWith("/") && !source.src.startsWith("//") && !source.src.startsWith("/api/")
    && !(source.kind === "owned" && source.referenceContext === "appearance-unverified"));
  if (!sources.length) return null;
  return { slug: place.slug, name: place.name, shortName: place.shortName, municipality: place.municipality,
    town: MUNICIPALITY_BY_SLUG[place.municipality].name,
    photoPlan: { key: JSON.stringify([place.slug, sources.map(source => [source.kind, source.src])]), sources } };
}

/** Supplying only the exact slug keeps Google metadata outside this path.
 * Only already bundled owned/licensed bytes can enter this visual selection. */
export function localDiscoveryPlaces(scope: Scope | null): LocalDiscoveryPlace[] {
  const active = parseScope(scope) ?? "county";
  if (active === "nearme") return [];
  const town = scopeTownSlug(active);
  return LOCAL_DISCOVERY_IDENTITIES.filter(place => town ? place.municipality === town : place.countyLead)
    .flatMap(place => { const resolved = localDiscoveryPlace(place.slug); return resolved ? [resolved] : []; });
}
