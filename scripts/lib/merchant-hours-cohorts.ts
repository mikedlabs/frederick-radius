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

const REVIEWED_VISIBLE_CONTACT_COHORTS: readonly OfficialHoursCohort[] = [
  {
    "shape": "visible_weekly_contact_card",
    "ledger_id": "firebirds_wood_fired_grill_frederick_hours",
    "source_url": "https://firebirdsrestaurants.com/frederick",
    "canonical_url": "https://firebirdsrestaurants.com/frederick",
    "bindings": [
      {
        "slug": "firebirds-wood-fired-grill-frederick",
        "source_name": "Firebirds Wood Fired Grill",
        "identity": {
          "name": "Firebirds Wood Fired Grill",
          "street": "5201 Buckeystown Pike",
          "locality": "Frederick",
          "region": "MD",
          "postalCode": "21704",
          "phone": "3018500077"
        }
      }
    ],
    "locations": {
      "firebirds-wood-fired-grill-frederick": {
        "name": {
          "selector": "title",
          "expected": "Frederick, MD | Firebirds Wood Fired Grill"
        },
        "address": {
          "selector": ".masthead .icon-list__link",
          "expected": "5201 Buckeystown Pike Frederick, MD 21704"
        },
        "phone": {
          "selector": ".masthead a[href^=\"tel:\"]",
          "expected": "tel:(301) 850-0077",
          "attribute": "href"
        },
        "weeks": [
          {
            "selector": ".masthead .icon-list__item:nth-child(2) .icon-list__detail",
            "count": 1,
            "label": "Hours"
          }
        ]
      }
    }
  },
  {
    "shape": "visible_weekly_contact_card",
    "ledger_id": "fratellis_italian_seafood_middletown_hours",
    "source_url": "https://www.fratellispasta.com/location/fratellis-middletown/",
    "canonical_url": "https://www.fratellispasta.com/location/fratellis-middletown/",
    "bindings": [
      {
        "slug": "fratellis-italian-seafood-middletown",
        "source_name": "Fratelli's Italian & Seafood",
        "identity": {
          "name": "Fratelli's Italian and Seafood",
          "street": "200 Middletown Pkwy",
          "locality": "Middletown",
          "region": "MD",
          "postalCode": "21769",
          "phone": "3013714000"
        }
      }
    ],
    "locations": {
      "fratellis-italian-seafood-middletown": {
        "name": {
          "selector": "title",
          "expected": "Middletown | Hours + Location | Fratelli's Italian and Seafood"
        },
        "address": {
          "selector": "#intro > p:first-of-type > a:first-child",
          "expected": "200 Middletown Pkwy, Middletown, MD 21769"
        },
        "phone": {
          "selector": "#intro a[href^=\"tel:\"]",
          "expected": "tel:(301) 371-4000",
          "attribute": "href"
        },
        "weeks": [
          {
            "selector": "#intro",
            "count": 1,
            "label": "Hours & Location 200 Middletown Pkwy, Middletown, MD 21769 (301) 371-4000 middletown@fratellispasta.com"
          }
        ]
      }
    }
  },
  {
    "shape": "visible_weekly_contact_card",
    "ledger_id": "hinzis_kitchen_hours",
    "source_url": "https://hinzis.com/",
    "canonical_url": "https://hinzis.com/",
    "bindings": [
      {
        "slug": "hinzis-kitchen",
        "source_name": "Hinzi's Kitchen",
        "identity": {
          "name": "Hinzi's Kitchen",
          "street": "503 N East St",
          "locality": "Frederick",
          "region": "MD",
          "postalCode": "21701",
          "phone": "3018357694"
        }
      }
    ],
    "locations": {
      "hinzis-kitchen": {
        "name": {
          "selector": "title",
          "expected": "Hinzi's Kitchen | Mediterranean Bowls & Halal Food, Frederick & Germantown MD"
        },
        "address": {
          "selector": "footer a[href=\"/frederick/\"]",
          "expected": "503 N East St, Frederick, MD 21701"
        },
        "phone": {
          "selector": "footer a[href=\"tel:+13018357694\"]",
          "expected": "tel:+13018357694",
          "attribute": "href"
        },
        "weeks": [
          {
            "selector": ".loc-grid > .loc:first-child p.line",
            "count": 1,
            "label": "503 N East St , Frederick, MD 21701"
          },
          {
            "selector": "footer .foot-grid > div:nth-child(3) p",
            "count": 1,
            "label": "503 N East St, Frederick, MD 21701",
            "suffix": "(301) 835-7694"
          }
        ],
        "structured": {
          "schema_type": "Restaurant",
          "entity_url": "https://hinzis.com/frederick/",
          "name": "Hinzi's Kitchen — Frederick"
        },
        "other_locations": [
          {
            "selector": ".loc-grid > .loc:nth-child(2)",
            "expected_text": "Germantown Now open ★ 4.8 on Google · 150+ reviews 13015 Wisteria Dr , Germantown, MD 20874 Tue–Sun 11am–9pm · Mon closed Order Directions Call",
            "identity": {
              "name": "Germantown",
              "street": "13015 Wisteria Dr",
              "locality": "Germantown",
              "region": "MD",
              "postalCode": "20874",
              "phone": "2402436902"
            }
          },
          {
            "selector": "footer .foot-grid > div:nth-child(4)",
            "expected_text": "Germantown 13015 Wisteria Dr, Germantown, MD 20874 Tue–Sun 11am–9pm · Closed Mondays (240) 243-6902",
            "identity": {
              "name": "Germantown",
              "street": "13015 Wisteria Dr",
              "locality": "Germantown",
              "region": "MD",
              "postalCode": "20874",
              "phone": "2402436902"
            }
          }
        ]
      }
    }
  },
  {
    "shape": "visible_weekly_contact_card",
    "ledger_id": "hoffman_brothers_ice_cream_hours",
    "source_url": "https://sashaahoffman.wixsite.com/hoffmanbrothersicecr",
    "canonical_url": "https://sashaahoffman.wixsite.com/hoffmanbrothersicecr",
    "bindings": [
      {
        "slug": "hoffman-brothers-ice-cream",
        "source_name": "Hoffman Brothers Ice Cream",
        "identity": {
          "name": "Hoffman Brothers Ice Cream",
          "street": "4 N Carroll St",
          "locality": "Frederick",
          "region": "MD",
          "postalCode": "21701",
          "phone": "3018355266"
        }
      }
    ],
    "locations": {
      "hoffman-brothers-ice-cream": {
        "name": {
          "selector": "title",
          "expected": "Home | Hoffman Brothers Ice Cream"
        },
        "address": {
          "selector": "#comp-l9g0ijh8",
          "expected": "4 N Carroll St, Frederick, MD 21701, USA"
        },
        "phone": {
          "selector": "a[href=\"tel:3018355266\"]",
          "expected": "tel:3018355266",
          "attribute": "href"
        },
        "weeks": [
          {
            "selector": "#comp-l9degebk5",
            "count": 1
          }
        ]
      }
    }
  },
  {
    "shape": "visible_weekly_contact_card",
    "ledger_id": "frederick_fudge_ice_cream_hours",
    "source_url": "https://fredicecream.com/",
    "canonical_url": "https://fredicecream.com/",
    "bindings": [
      {
        "slug": "frederick-fudge-ice-cream",
        "source_name": "Frederick Fudge Ice Cream",
        "identity": {
          "name": "Frederick Fudge & Ice Cream",
          "street": "253 East Church St",
          "locality": "Frederick",
          "region": "MD",
          "postalCode": "21701",
          "phone": "3016315333"
        }
      }
    ],
    "locations": {
      "frederick-fudge-ice-cream": {
        "name": {
          "selector": "title",
          "expected": "Frederick Fudge & Ice Cream | Fudge, Ice Cream & Chocolate"
        },
        "address": {
          "selector": "footer a[href=\"https://goo.gl/maps/C3HMVtKtBwNojK428\"]",
          "expected": "253 East Church St. Frederick, MD 21701"
        },
        "phone": {
          "selector": "footer a[href=\"tel:3016315333\"]",
          "expected": "tel:3016315333",
          "attribute": "href"
        },
        "weeks": [
          {
            "selector": ".dsm_business_hours_0_tb_footer",
            "count": 1
          }
        ],
        "social_archive": {
          "selector": "#sb_instagram",
          "item_selector": ".sbi_item",
          "timestamp_attribute": "data-date",
          "posts": [
            {
              "id": "sbi_17965972191024087",
              "timestamp": "1776101309",
              "href": "https://www.instagram.com/p/DXFIi5sAGXv/",
              "text_sha256": "56f9d66b85da98dca08c5d9d91951fd7d5aa6bbb94fc43fdf4b61c01897fa6e8"
            },
            {
              "id": "sbi_18158788030445400",
              "timestamp": "1775417186",
              "href": "https://www.instagram.com/p/DWwvwQ4jTV4/",
              "text_sha256": "a38c9e117d7d62b6d189846025792eb512d21182b3201798e86bbfaaebb9edac"
            },
            {
              "id": "sbi_18104132338859197",
              "timestamp": "1773155898",
              "href": "https://www.instagram.com/p/DVtWQFXgI3R/",
              "text_sha256": "d623197cd57a070fd169fe7e7f58f7d7cb07bf4251918e4f8f0990cf0238ced7"
            },
            {
              "id": "sbi_17879453568387024",
              "timestamp": "1771790232",
              "href": "https://www.instagram.com/p/DVEp6n3j82I/",
              "text_sha256": "738bc4c4a7f8ba42bb48f25599fb6ca41ab790ec25c460a7277be3d4da884fc9"
            },
            {
              "id": "sbi_18076180640381820",
              "timestamp": "1770405246",
              "href": "https://www.instagram.com/p/DUbX-cajwb4/",
              "text_sha256": "4b903876f0894e93952f6de5dbdef994256338767535d0b0371df689c9e0899d"
            }
          ]
        }
      }
    }
  },
  {
    "shape": "visible_weekly_contact_card",
    "ledger_id": "carriage_house_inn_restaurant_catering_emmitsburg_hours",
    "source_url": "https://chouseinn.com/",
    "canonical_url": "https://chouseinn.com/",
    "bindings": [
      {
        "slug": "carriage-house-inn-restaurant-catering-emmitsburg",
        "source_name": "Carriage House Inn Restaurant & Catering",
        "identity": {
          "name": "The Carriage House Inn",
          "street": "200 S Seton Ave",
          "locality": "Emmitsburg",
          "region": "MD",
          "postalCode": "21727",
          "phone": "3014472366"
        }
      }
    ],
    "locations": {
      "carriage-house-inn-restaurant-catering-emmitsburg": {
        "name": {
          "selector": "title",
          "expected": "Home - The Carriage House Inn"
        },
        "address": {
          "selector": ".elementor-element-931ac9f h2",
          "expected": "200 S Seton Ave, Emmitsburg, MD 21727"
        },
        "phone": {
          "selector": "a[href=\"tel:%20(301)%20447-2366\"]",
          "expected": "tel:%20(301)%20447-2366",
          "attribute": "href"
        },
        "weeks": [
          {
            "selector": ".elementor-element-8f96fe2 h2",
            "count": 1,
            "partitions": {
              "labels": [
                "Lunch",
                "Dinner"
              ],
              "days": [
                "tue",
                "wed",
                "thu",
                "fri",
                "sat"
              ]
            }
          }
        ]
      }
    }
  },
  {
    "shape": "visible_weekly_contact_card",
    "ledger_id": "el_rancho_restaurant_walkersville_hours",
    "source_url": "https://elrancho-restaurant.com/",
    "canonical_url": "https://elrancho-restaurant.com/",
    "bindings": [
      {
        "slug": "el-rancho-restaurant-walkersville",
        "source_name": "El Rancho Restaurant",
        "identity": {
          "name": "El Rancho",
          "street": "111 Walkers Village Way",
          "locality": "Walkersville",
          "region": "MD",
          "postalCode": "21793",
          "phone": "3013049474"
        }
      }
    ],
    "locations": {
      "el-rancho-restaurant-walkersville": {
        "name": {
          "selector": "title",
          "expected": "El Rancho"
        },
        "address": {
          "selector": ".hoursLocation .location",
          "expected": "111 Walkers Village Way Walkersville, MD 21793"
        },
        "phone": {
          "selector": ".hoursLocation a[href^=\"tel:\"]",
          "expected": "tel:(301) 304-9474",
          "attribute": "href"
        },
        "weeks": [
          {
            "selector": ".hoursLocation .hours",
            "count": 1
          }
        ],
        "headings": [
          ".hoursLocation .heading-hours"
        ]
      }
    }
  }
];

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
}, ...SAFEWAY_COHORTS, ...FOOD_LION_COHORTS, ...REVIEWED_VISIBLE_CONTACT_COHORTS];

export function merchantHoursCohort(source: MerchantHoursSource) {
  const matches = MERCHANT_HOURS_COHORTS.flatMap((cohort) => cohort.bindings.filter((binding) => binding.slug === source.slug).map((binding) => ({ cohort, binding })));
  if (matches.length > 1) throw new Error("Ambiguous reviewed merchant cohort enrollment.");
  const match = matches[0];
  if (match && (match.cohort.source_url !== source.url || match.cohort.ledger_id !== source.ledger_id || match.binding.source_name !== source.name)) throw new Error("Mismatched reviewed merchant cohort ownership.");
  return match;
}
