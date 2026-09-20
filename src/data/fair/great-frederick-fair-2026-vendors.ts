import type { FairVendor } from "@/lib/fair/domain";
import { fairVendorDirectoryHref } from "@/lib/fair/vendor-finder";

export type FairVendorProfile = FairVendor & {
  summary: string;
  highlights: string[];
  searchAliases: string[];
  websiteUrl?: string;
  menuUrl?: string;
  menuLabel?: string;
  directoryUrl: string;
};

const DIRECTORY_REVIEWED_AT = "2026-09-20T01:16:11.628Z";
const BUSINESS_SOURCES_REVIEWED_AT = "2026-09-20T10:32:24Z";

type VendorReview = Pick<
  FairVendorProfile,
  | "id"
  | "name"
  | "kind"
  | "summary"
  | "highlights"
  | "searchAliases"
  | "websiteUrl"
  | "menuUrl"
  | "menuLabel"
> & {
  booths: string;
  sources: Omit<FairVendor["provenance"][number], "verifiedAt">[];
};

function reviewedVendor({
  booths,
  sources,
  ...profile
}: VendorReview): FairVendorProfile {
  const directoryUrl = fairVendorDirectoryHref(profile.name);
  return {
    ...profile,
    directoryUrl,
    booth: { status: "known", value: booths },
    zoneId: {
      status: "unknown",
      reason:
        "The official booth reference has not been matched to a reviewed Radius map location.",
    },
    operatingHours: {
      status: "unknown",
      reason:
        "Vendor-specific Fair hours have not been confirmed. Restaurant hours do not apply to the booth.",
    },
    provenance: [
      {
        publisher: "The Great Frederick Fair",
        sourceTitle: "2026 vendor directory: exhibitor and booth references",
        sourceUrl: directoryUrl,
        verifiedAt: DIRECTORY_REVIEWED_AT,
      },
      ...sources.map((source) => ({
        ...source,
        verifiedAt: BUSINESS_SOURCES_REVIEWED_AT,
      })),
    ],
  };
}

/**
 * A small, independently reviewed editorial selection, not a directory mirror.
 * Only factual exhibitor names and booth references are taken from the Fair's
 * 2026 directory. No EventHub artwork, photographs, or booth geometry is copied.
 * Summaries describe the businesses, not a confirmed Fair menu or stock list.
 * Restaurant links must remain labeled as such; they are not Fair ordering links.
 * Booth references can change. The organizer's current directory remains the
 * source of truth, and no booth reference here establishes a mapped coordinate.
 */
export const greatFrederickFair2026Vendors: readonly FairVendorProfile[] = [
  reviewedVendor({
    id: "vendor-white-rabbit-rad-pies",
    name: "White Rabbit x Rad Pies",
    kind: "food",
    booths: "587, 588",
    summary:
      "The Fair lists White Rabbit and Rad Pies together. Both restaurant menus feature Detroit-style pizza.",
    highlights: ["Detroit-style pizza", "White Rabbit + Rad Pies"],
    searchAliases: [
      "White Rabbit",
      "White Rabbit Gastropub",
      "Rad Pies",
      "RadPies",
      "Detroit pizza",
      "In Crust We Trust",
    ],
    websiteUrl: "https://www.whiterabbitgastropub.com/",
    menuUrl: "https://www.radpies.com/menu/pizza/",
    menuLabel: "Rad Pies restaurant menu",
    sources: [
      {
        publisher: "White Rabbit Gastropub",
        sourceTitle: "About White Rabbit Gastropub",
        sourceUrl: "https://www.whiterabbitgastropub.com/readme",
      },
      {
        publisher: "Rad Pies",
        sourceTitle: "Restaurant pizza menu",
        sourceUrl: "https://www.radpies.com/menu/pizza/",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-big-papis-tacos",
    name: "Big Papi's Tacos",
    kind: "food",
    booths: "589, 590, 591",
    summary:
      "Big Papi's makes Mexican food in Frederick, with birria tacos among its restaurant specialties.",
    highlights: ["Tacos", "Birria"],
    searchAliases: ["Big Papis", "Papi tacos", "birria", "Mexican food"],
    websiteUrl: "https://bigpapistacos.com/bpt1-frederick",
    menuUrl: "https://order.toasttab.com/online/big-papis",
    menuLabel: "Restaurant menu",
    sources: [
      {
        publisher: "Big Papi's Tacos",
        sourceTitle: "Big Papi's Frederick restaurant",
        sourceUrl: "https://bigpapistacos.com/bpt1-frederick",
      },
      {
        publisher: "Big Papi's Tacos",
        sourceTitle: "Frederick restaurant menu on Toast",
        sourceUrl: "https://order.toasttab.com/online/big-papis",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-boxcar-burgers",
    name: "Boxcar Burgers",
    kind: "food",
    booths: "387",
    summary:
      "Boxcar makes burgers with beef raised in Frederick County and bought directly from family farms.",
    highlights: ["Burgers", "Frederick County beef"],
    searchAliases: ["Boxcar", "hamburgers", "local beef", "cheeseburgers"],
    websiteUrl: "https://boxcarburgers.com/",
    sources: [
      {
        publisher: "Boxcar Burgers",
        sourceTitle: "Boxcar Burgers: local beef and Fair appearances",
        sourceUrl: "https://boxcarburgers.com/",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-jb-seafood",
    name: "JB Seafood",
    kind: "food",
    booths:
      "235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 258, 259, 260, 261, 262, 263, 264, 265, 276, 277, 278, 285",
    summary:
      "JB Seafood specializes in seafood and crab cakes. Its own website also lists the Great Frederick Fair among its event appearances.",
    highlights: ["Seafood", "Crab cakes"],
    searchAliases: ["J B Seafood", "JB", "crab cake", "seafood"],
    websiteUrl: "https://www.jbseafood.com/",
    sources: [
      {
        publisher: "JB Seafood",
        sourceTitle: "About JB Seafood",
        sourceUrl: "https://www.jbseafood.com/aboutus",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-south-mountain-creamery",
    name: "South Mountain Creamery",
    kind: "food",
    booths: "369, 370, 371",
    summary:
      "South Mountain Creamery is a family-owned dairy farm and creamery in Middletown that makes ice cream.",
    highlights: ["Ice cream", "Frederick County dairy"],
    searchAliases: ["SMC", "South Mountain", "ice cream", "dessert", "dairy"],
    websiteUrl: "https://southmountaincreamery.com/",
    menuUrl: "https://southmountaincreamery.com/products/ice-cream/",
    menuLabel: "Creamery flavor list",
    sources: [
      {
        publisher: "South Mountain Creamery",
        sourceTitle: "South Mountain Creamery farm and dairy",
        sourceUrl: "https://southmountaincreamery.com/",
      },
      {
        publisher: "South Mountain Creamery",
        sourceTitle: "Creamery ice cream flavors",
        sourceUrl: "https://southmountaincreamery.com/products/ice-cream/",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-casimir-bakery",
    name: "Casimir Bakery",
    kind: "food",
    booths: "53",
    summary:
      "Casimir Bakery makes cakes and cookies in Washington County. Founder Shantell Brown trained at the Culinary Institute of America.",
    highlights: ["Cookies", "Baked sweets"],
    searchAliases: ["Casimir", "bakery", "cookies", "dessert", "sweets"],
    websiteUrl: "https://www.casimirbakery.com/",
    sources: [
      {
        publisher: "Casimir Bakery",
        sourceTitle: "Casimir Bakery and founder Shantell Brown",
        sourceUrl: "https://www.casimirbakery.com/",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-brewers-alley",
    name: "Brewers Alley",
    kind: "food",
    booths: "73, 74",
    summary:
      "Brewer's Alley is a Frederick brewpub that has brewed beer since 1996.",
    highlights: ["Craft beer", "Frederick brewpub"],
    searchAliases: ["Brewer's Alley", "Brewers", "beer", "brewery", "drinks"],
    websiteUrl: "https://brewers-alley.com/",
    sources: [
      {
        publisher: "Brewer's Alley",
        sourceTitle: "Brewer's Alley brewery and restaurant",
        sourceUrl: "https://brewers-alley.com/",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-linganore-winecellars",
    name: "Linganore Winecellars",
    kind: "food",
    booths: "75",
    summary:
      "Linganore Winecellars is a family-run Mount Airy winery making dry, sweet and fruit wines.",
    highlights: ["Maryland wine", "Dry and sweet wines"],
    searchAliases: ["Linganore", "Linganore winery", "wine", "winery", "drinks"],
    websiteUrl: "https://www.linganorewines.com/",
    sources: [
      {
        publisher: "Linganore Winecellars",
        sourceTitle: "Linganore Winecellars winery and wines",
        sourceUrl: "https://www.linganorewines.com/",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-mcclintock-distilling",
    name: "McClintock Distilling",
    kind: "food",
    booths: "60",
    summary:
      "McClintock makes organic spirits in Frederick, including gin and whiskey.",
    highlights: ["Local spirits", "Gin and whiskey"],
    searchAliases: [
      "McClintock",
      "distillery",
      "spirits",
      "gin",
      "whiskey",
      "drinks",
    ],
    websiteUrl: "https://mcclintockdistilling.com/",
    sources: [
      {
        publisher: "McClintock Distilling",
        sourceTitle: "McClintock organic distillery and spirits",
        sourceUrl: "https://mcclintockdistilling.com/",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-tenth-ward-distilling",
    name: "Tenth Ward Distilling Company",
    kind: "food",
    booths: "76",
    summary:
      "Tenth Ward is a woman-owned distillery in downtown Frederick making spirits and canned cocktails.",
    highlights: ["Local spirits", "Canned cocktails"],
    searchAliases: [
      "Tenth Ward",
      "10th Ward",
      "distillery",
      "spirits",
      "cocktails",
      "drinks",
    ],
    websiteUrl: "https://www.tenthwarddistilling.com/",
    sources: [
      {
        publisher: "Tenth Ward Distilling Company",
        sourceTitle: "Tenth Ward distillery and products",
        sourceUrl: "https://www.tenthwarddistilling.com/",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-dragon-distillery",
    name: "Dragon Distillery",
    kind: "food",
    booths: "62, 63",
    summary:
      "Dragon Distillery is a woman-owned Frederick distillery making handcrafted spirits.",
    highlights: ["Local spirits", "Frederick distillery"],
    searchAliases: ["Dragon", "distillery", "spirits", "whiskey", "drinks"],
    websiteUrl: "https://www.dragon-distillery.com/",
    sources: [
      {
        publisher: "Dragon Distillery",
        sourceTitle: "Dragon Distillery handcrafted spirits",
        sourceUrl: "https://www.dragon-distillery.com/",
      },
    ],
  }),
  reviewedVendor({
    id: "vendor-altmeyers-western-wear",
    name: "Altmeyers Western Wear",
    kind: "retail",
    booths: "409, 410, 411, 412, 413, 428, 429",
    summary:
      "The Fair lists Altmeyers Western Wear as a 2026 exhibitor.",
    highlights: ["Western wear"],
    searchAliases: [
      "Altmeyer's",
      "Altmeyers",
      "western wear",
      "shopping",
    ],
    websiteUrl: "https://altmeyerswesternwear.com/",
    // The business site could not be reviewed. Only the Fair listing is evidence.
    sources: [],
  }),
];
