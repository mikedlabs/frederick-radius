import type { MerchantHoursSource } from "../../src/lib/merchant-hours";
import type { OfficialHoursCohort } from "./official-hours-cohort";


const SAFEWAY_LOCATIONS = [
  { slug: "safeway-middletown", source_name: "Safeway Middletown", ledger_id: "safeway_middletown_hours", source_url: "https://local.safeway.com/safeway/md/middletown/815-e-main-st.html", entity_id: "https://local.safeway.com/#5604120", street: "815 E Main St", locality: "Middletown", postalCode: "21769", phone: "3013713126" },
  { slug: "safeway-walkersville", source_name: "Safeway Walkersville", ledger_id: "safeway_walkersville_hours", source_url: "https://local.safeway.com/safeway/md/walkersville/151-walkers-village-way.html", entity_id: "https://local.safeway.com/#5603993", street: "151 Walkers Village Way", locality: "Walkersville", postalCode: "21793", phone: "3018452844" },
] as const;
/** Same reviewed store disclosure shape; separate exact page and identity. */
const SAFEWAY_COHORTS: readonly OfficialHoursCohort[] = SAFEWAY_LOCATIONS.map((location) => ({
  ledger_id: location.ledger_id, source_url: location.source_url, shape: "microdata_store_week",
  schema_type: "http://schema.org/GroceryStore", entity_ids: { [location.slug]: location.entity_id },
  selectors: {
    card: "main#main[itemscope]", name: "meta#location-name[itemprop='name']", address: "address#address[itemprop='address']",
    street: ".c-address-street-1", locality: ".c-address-city", region: "[itemprop='addressRegion']",
    postalCode: "[itemprop='postalCode']", phone: "[itemprop='telephone']", schedule: ".js-hours-table",
  },
  hours_section: ".js-intent-hours-section", toggle: ".RedesignCore-hoursButtons > button",
  panel: ".RedesignCore-hoursWrapper > .js-intent-core-hours", toggle_labels: ["Store Hours", "Pharmacy Hours"], store_label: "Store Hours", independent_offer_names: ["Delivery in a Flash"],
  hero_schedule: ".RedesignHero-hours > .js-hours-today[data-days]", panel_schedule: ":scope > .js-hours-today[data-days]",
  schedule_row: ".c-hours-details > tbody > tr", day: ".c-hours-details-row-day", periods: ".c-hours-details-row-intervals",
  bindings: [{ slug: location.slug, source_name: location.source_name, identity: { name: "Safeway", street: location.street, locality: location.locality, region: "MD", postalCode: location.postalCode, phone: location.phone } }],
}));

const FOOD_LION_LOCATIONS = [
  { slug: "food-lion-crestwood-frederick", source_name: "Food Lion Crestwood", ledger_id: "food_lion_crestwood_hours", source_url: "https://stores.foodlion.com/md/frederick/6920-crestwood-blvd", entity_id: "https://stores.foodlion.com/#5046692", name: "Food Lion Grocery Store of Crestwood Plaza", street: "6920 Crestwood Blvd", locality: "Frederick", postalCode: "21703", phone: "3018464704" },
  { slug: "food-lion-yellow-springs-frederick", source_name: "Food Lion Yellow Springs", ledger_id: "food_lion_yellow_springs_hours", source_url: "https://stores.foodlion.com/md/frederick/2060-yellow-springs-rd.", entity_id: "https://stores.foodlion.com/#5046537", name: "Food Lion Grocery Store of Frederick", street: "2060 Yellow Springs Rd.", locality: "Frederick", postalCode: "21702", phone: "3018464623" },
  { slug: "food-lion-thurmont", source_name: "Food Lion Thurmont", ledger_id: "food_lion_thurmont_hours", source_url: "https://stores.foodlion.com/md/thurmont/231-tippin-dr", entity_id: "https://stores.foodlion.com/#5046567", name: "Food Lion Grocery Store of Thurmont", street: "231 Tippin Dr", locality: "Thurmont", postalCode: "21788", phone: "3012719949" },
] as const;
/** Three exact reviewed primary grocery identities, not host-wide enrollment. */
const FOOD_LION_COHORTS: readonly OfficialHoursCohort[] = FOOD_LION_LOCATIONS.map(location => ({
  ledger_id: location.ledger_id, source_url: location.source_url, shape: "microdata_primary_store_week",
  schema_type: "https://schema.org/GroceryStore", entity_ids: { [location.slug]: location.entity_id },
  selectors: { card: "main#main[itemscope]", name: "#location-name[itemprop='name']", address: "address.Address-content[itemprop='address']", street: ".Address-line1", locality: ".Address-city", region: "[itemprop='addressRegion']", postalCode: "[itemprop='postalCode']", phone: "[itemprop='telephone']", schedule: ".Core-storeHours .js-hours-table" },
  hero_schedule: ".Hero-hoursTodayRow > .js-hours-today[data-days]", panel_schedule: ".Core-storeToday > .js-hours-today[data-days]",
  schedule_row: ".c-hours-details > tbody > tr", day: ".c-hours-details-row-day", periods: ".c-hours-details-row-intervals",
  bindings: [{ slug: location.slug, source_name: location.source_name, identity: { name: location.name, street: location.street, locality: location.locality, region: "MD", postalCode: location.postalCode, phone: location.phone } }],
}));

/** Reviewed enrollment only. Shared hosts never enroll additional listings. */
export const MERCHANT_HOURS_COHORTS: readonly OfficialHoursCohort[] = [{
  ledger_id: "common_market_hours",
  source_url: "https://www.commonmarket.coop/",
  shape: "shared_daily_contact_card",
  organization_name: "Common Market",
  schedule_container: ".hours",
  selectors: {
    card: "address.vcard", name: ".org[itemprop='name']", address: ".adr[itemprop='address']",
    street: "[itemprop='streetAddress']", locality: "[itemprop='addressLocality']", region: "[itemprop='addressRegion']",
    postalCode: "[itemprop='postalCode']", phone: ".tel .value", schedule: ".hours .open",
  },
  bindings: [
    { slug: "common-market-frederick", source_name: "Common Market Co-op (Route 85)", identity: { name: "Common Market", street: "5728 Buckeystown Pike, Unit B1", locality: "Frederick", region: "MD", postalCode: "21704", phone: "3016633416" } },
    { slug: "common-market", source_name: "Common Market (7th Street)", identity: { name: "Common Market", street: "927 W 7th Street", locality: "Frederick", region: "MD", postalCode: "21701", phone: "3016633416" } },
  ],
}, ...SAFEWAY_COHORTS, ...FOOD_LION_COHORTS];

export function merchantHoursCohort(source: MerchantHoursSource) {
  const matches = MERCHANT_HOURS_COHORTS.flatMap((cohort) => cohort.bindings.filter((binding) => binding.slug === source.slug).map((binding) => ({ cohort, binding })));
  if (matches.length > 1) throw new Error("Ambiguous reviewed merchant cohort enrollment.");
  const match = matches[0];
  if (match && (match.cohort.source_url !== source.url || match.cohort.ledger_id !== source.ledger_id || match.binding.source_name !== source.name)) throw new Error("Mismatched reviewed merchant cohort ownership.");
  return match;
}
