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
  { slug: "human-services", label: "Human services", icon: "HeartHandshake", blurb: "These organizations provide food, housing, relief, or other direct help." },
  { slug: "youth-recreation", label: "Youth & recreation", icon: "Bike", blurb: "Find leagues and recreation programs for young people." },
  { slug: "faith", label: "Faith & religion", icon: "Church", blurb: "Find congregations and organizations rooted in faith." },
  { slug: "education", label: "Education", icon: "GraduationCap", blurb: "Find schools and groups that support local learning." },
  { slug: "arts", label: "Arts & culture", icon: "Palette", blurb: "This section covers performing arts, museums, and local history." },
  { slug: "community", label: "Community & advocacy", icon: "Users", blurb: "Find groups working on neighborhood improvement, civil rights, or local capacity." },
  { slug: "health", label: "Health & wellness", icon: "Stethoscope", blurb: "Find clinics and organizations focused on physical or mental health." },
  { slug: "philanthropy", label: "Philanthropy", icon: "HandCoins", blurb: "Find foundations and other organizations that fund local work." },
  { slug: "environment", label: "Environment & animals", icon: "Trees", blurb: "Find land trusts and groups working in conservation or animal welfare." },
  { slug: "public-safety", label: "Public safety", icon: "Siren", blurb: "Find fire and rescue groups alongside disaster-preparedness organizations." },
  { slug: "international", label: "International", icon: "Globe", blurb: "These organizations work in foreign affairs, aid, or cross-border programs." },
  { slug: "membership", label: "Membership & mutual", icon: "Landmark", blurb: "This section includes fraternal orders, cemeteries, and mutual-benefit groups." },
  { slug: "other", label: "Other", icon: "Circle", blurb: "The IRS has not yet assigned these registered organizations to another category." },
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
