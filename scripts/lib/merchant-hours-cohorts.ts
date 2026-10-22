import type { MerchantHoursSource } from "../../src/lib/merchant-hours";
import type { OfficialHoursCohort } from "./official-hours-cohort";

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
}];

export function merchantHoursCohort(source: MerchantHoursSource) {
  const matches = MERCHANT_HOURS_COHORTS.flatMap((cohort) => cohort.bindings.filter((binding) => binding.slug === source.slug).map((binding) => ({ cohort, binding })));
  if (matches.length > 1) throw new Error("Ambiguous reviewed merchant cohort enrollment.");
  const match = matches[0];
  if (match && (match.cohort.source_url !== source.url || match.cohort.ledger_id !== source.ledger_id || match.binding.source_name !== source.name)) throw new Error("Mismatched reviewed merchant cohort ownership.");
  return match;
}
