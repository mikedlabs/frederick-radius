import type {
  PublicParkAsset,
} from "@/lib/integrations/fcParkAssetsPublic";
import type {
  Amenity,
  AmenityKind,
} from "@/lib/loaders/amenities";
import { resolveMunicipality } from "@/lib/connect";

const COUNTY_ASSET_AMENITY_KIND: Partial<
  Record<PublicParkAsset["kind"], AmenityKind>
> = {
  bench: "bench",
  bike_rack: "bike_parking",
  bike_repair: "bike_repair",
  boat_ramp: "water_access",
  paddle_launch: "water_access",
  dog_park: "dog_park",
  drinking_water: "water",
  water_fixture: "other",
  grill: "picnic",
  picnic_table: "picnic",
  portable_toilet: "restroom",
  recycling: "recycling",
  trash: "trash",
};

function assetNoun(kind: AmenityKind): string {
  switch (kind) {
    case "bike_parking":
      return "Bike rack";
    case "bike_repair":
      return "Bike repair station";
    case "water":
      return "Drinking fountain";
    case "water_access":
      return "Water access";
    case "dog_park":
      return "Dog park";
    case "other":
      return "Water fixture";
    case "restroom":
      return "Portable toilet";
    case "picnic":
      return "Picnic amenity";
    case "recycling":
      return "Recycling receptacle";
    case "trash":
      return "Trash receptacle";
    default:
      return "Bench";
  }
}

/**
 * Project an allowlisted County park asset into the map/Ask amenity contract.
 *
 * County source records deliberately keep availability unknown. That caveat
 * stays on the projected record so neither the map nor Ask can present a
 * mapped point as proof that a fountain works or a portable toilet is present
 * today.
 */
export function countyParkAssetAmenity(
  asset: PublicParkAsset,
): Amenity | null {
  const kind = COUNTY_ASSET_AMENITY_KIND[asset.kind];
  if (!kind) return null;
  const [lng, lat] = asset.geometry.coordinates;
  const noun = assetNoun(kind);
  const municipality = resolveMunicipality({ lng, lat }).municipality.slug;
  const availability =
    asset.kind === "water_fixture"
      ? "Potability and availability are not confirmed"
      : "Availability is not confirmed";

  return {
    id: asset.id,
    kind,
    name: asset.parkName ? `${noun} · ${asset.parkName}` : noun,
    detail: `Frederick County park map · ${availability}`,
    municipality,
    lng,
    lat,
  };
}
