/**
 * NTEE (National Taxonomy of Exempt Entities) major-group → human category.
 *
 * The IRS Exempt Organizations Business Master File tags most orgs with an
 * NTEE code whose FIRST LETTER is one of 26 major groups (A–Z). We collapse
 * those 26 into a smaller, browsable set of cause buckets for the /nonprofits
 * filter — the same plain-language spirit as the rest of the app, but here
 * the buckets are causes, so they read as nouns.
 *
 * Source taxonomy: Urban Institute / NCCS
 * (urbaninstitute.github.io/nccs-legacy/ntee/ntee.html). ~27% of Frederick
 * rows carry no NTEE at all (small 990-N filers) — those fall to "other",
 * an honest bucket, never fabricated.
 */

export type NonprofitCategory =
  | "arts"
  | "education"
  | "environment"
  | "health"
  | "human-services"
  | "youth-recreation"
  | "community"
  | "faith"
  | "philanthropy"
  | "public-safety"
  | "international"
  | "membership"
  | "other";

export type NonprofitCategoryMeta = {
  slug: NonprofitCategory;
  label: string;
  /** lucide-react icon name (rendered via the shared CategoryIcon seam). */
  icon: string;
  /** one-line, plain description for the section + empty states. */
  blurb: string;
};

/** Display order = rough public-facing interest, causes people browse first. */
export const NONPROFIT_CATEGORIES: NonprofitCategoryMeta[] = [
  { slug: "human-services", label: "Human services", icon: "HeartHandshake", blurb: "Food, housing, relief, and direct help for neighbors." },
  { slug: "youth-recreation", label: "Youth & recreation", icon: "Bike", blurb: "Sports leagues, youth programs, and clubs." },
  { slug: "faith", label: "Faith & religion", icon: "Church", blurb: "Congregations and faith-based organizations." },
  { slug: "education", label: "Education", icon: "GraduationCap", blurb: "Schools, PTAs, scholarships, and learning." },
  { slug: "arts", label: "Arts & culture", icon: "Palette", blurb: "Theaters, museums, music, and history." },
  { slug: "community", label: "Community & advocacy", icon: "Users", blurb: "Neighborhood improvement, civil rights, and local capacity." },
  { slug: "health", label: "Health & wellness", icon: "Stethoscope", blurb: "Clinics, disease groups, and mental health." },
  { slug: "philanthropy", label: "Philanthropy", icon: "HandCoins", blurb: "Foundations, grantmakers, and giving funds." },
  { slug: "environment", label: "Environment & animals", icon: "Trees", blurb: "Land trusts, conservation, and animal welfare." },
  { slug: "public-safety", label: "Public safety", icon: "Siren", blurb: "Fire, rescue, and disaster preparedness." },
  { slug: "international", label: "International", icon: "Globe", blurb: "Foreign affairs, aid, and cross-border work." },
  { slug: "membership", label: "Membership & mutual", icon: "Landmark", blurb: "Fraternal orders, cemeteries, and mutual-benefit groups." },
  { slug: "other", label: "Other", icon: "Circle", blurb: "Registered orgs the IRS has not yet categorized." },
];

export const NONPROFIT_CATEGORY_BY_SLUG: Record<NonprofitCategory, NonprofitCategoryMeta> =
  Object.fromEntries(NONPROFIT_CATEGORIES.map((c) => [c.slug, c])) as Record<
    NonprofitCategory,
    NonprofitCategoryMeta
  >;

/** NTEE major-group letter → cause bucket. */
const NTEE_MAJOR_TO_CATEGORY: Record<string, NonprofitCategory> = {
  A: "arts",
  B: "education",
  C: "environment",
  D: "environment",
  E: "health",
  F: "health",
  G: "health",
  H: "health",
  I: "community", // Crime & legal-related
  J: "human-services", // Employment
  K: "human-services", // Food, agriculture & nutrition
  L: "human-services", // Housing & shelter
  M: "public-safety", // Public safety, disaster prep & relief
  N: "youth-recreation", // Recreation & sports
  O: "youth-recreation", // Youth development
  P: "human-services", // Human services
  Q: "international",
  R: "community", // Civil rights, social action & advocacy
  S: "community", // Community improvement & capacity building
  T: "philanthropy",
  U: "community", // Science & technology
  V: "community", // Social science
  W: "community", // Public & societal benefit
  X: "faith",
  Y: "membership",
  Z: "other",
};

/**
 * Resolve an IRS NTEE_CD (e.g. "C34", "P20", "" ) to a cause bucket. Uses the
 * first letter only; unknown/blank → "other".
 */
export function nteeToCategory(nteeCd: string | null | undefined): NonprofitCategory {
  const letter = (nteeCd ?? "").trim().charAt(0).toUpperCase();
  return NTEE_MAJOR_TO_CATEGORY[letter] ?? "other";
}
