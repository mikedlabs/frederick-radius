/**
 * The "I want…" category tree — main categories, each with subcategories.
 *
 * Replaces the old flat wall of ~22 peer tiles (where "Dinner" sat confusingly
 * next to "Food", and utilities mixed in with cravings) with a real hierarchy: a
 * handful of MAIN categories that expand to their subcategories. One main per
 * intent, subcategories underneath, so the grid reads like a contents page and
 * everything has an obvious home.
 *
 * The eating problem is fixed structurally: there is no standalone "Dinner"
 * tile competing with "Food". "Eat" is the main category; the time-aware meal
 * ("Restaurants — open for dinner now") is injected as its LEAD subcategory at
 * render (see WantsAccordion), so the smart meal behavior survives without the
 * dinner-vs-food confusion.
 *
 * Subs link wherever the best answer lives: the geo-aware /nearby answer for
 * cravings, a curated surface (/brunch, /happy-hour, /trails, /rivers, /markers,
 * /plan, /amenities, /pulse) for the rest, or a /category page. This also pulls
 * the useful destinations that were buried in the header "More" drawer up onto
 * the front door. Pure + client-safe (icon names are strings; no React import).
 */

export type WantSub = {
  label: string;
  /** lucide icon name, resolved by the component's ICONS map. */
  icon: string;
  href: string;
};

export type WantCategory = {
  key: string;
  label: string;
  icon: string;
  /** Palette token for the tint, reusing the app's category inks. */
  color: string;
  /** True for "Eat": the component injects a time-aware "Restaurants — open for
   *  <meal> now" sub at the front, so the meal occasion lives INSIDE Eat. */
  mealLead?: boolean;
  subs: WantSub[];
};

export const WANTS: WantCategory[] = [
  {
    key: "eat",
    label: "Eat",
    icon: "Utensils",
    color: "var(--app-accent)",
    mealLead: true,
    subs: [
      { label: "Pizza", icon: "Pizza", href: "/category/pizza" },
      { label: "Coffee", icon: "Coffee", href: "/nearby?c=coffee" },
      { label: "Ice cream", icon: "IceCream", href: "/nearby?c=ice-cream" },
      { label: "Bakeries", icon: "Cookie", href: "/category/bakery" },
      { label: "Groceries", icon: "ShoppingCart", href: "/nearby?c=grocery" },
      { label: "Brunch", icon: "Croissant", href: "/brunch" },
    ],
  },
  {
    key: "drink",
    label: "Drink",
    icon: "Beer",
    color: "var(--app-positive)",
    subs: [
      { label: "Bars", icon: "Beer", href: "/nearby?c=drinks" },
      { label: "Breweries", icon: "Beer", href: "/nearby?c=breweries" },
      { label: "Wineries", icon: "Wine", href: "/nearby?c=wineries" },
      { label: "Distilleries", icon: "FlaskConical", href: "/category/distillery" },
      { label: "Wine & liquor shops", icon: "ShoppingBag", href: "/nearby?c=liquor" },
      { label: "Happy hour", icon: "Martini", href: "/happy-hour" },
    ],
  },
  {
    key: "outdoors",
    label: "Outdoors",
    icon: "Trees",
    color: "var(--app-positive)",
    subs: [
      { label: "Parks", icon: "Trees", href: "/nearby?c=outside" },
      { label: "Trails", icon: "Mountain", href: "/trails" },
      { label: "Rivers & creeks", icon: "Waves", href: "/rivers" },
      { label: "Dog parks", icon: "PawPrint", href: "/nearby?c=outside&facet=dog" },
      { label: "Pools & swimming", icon: "Waves", href: "/nearby?c=pools" },
      { label: "Golf", icon: "Flag", href: "/nearby?c=golf" },
      { label: "Farms & PYO", icon: "Tractor", href: "/nearby?c=farms" },
    ],
  },
  {
    key: "seedo",
    label: "See & do",
    icon: "Palette",
    color: "var(--app-accent)",
    subs: [
      { label: "Family fun", icon: "FerrisWheel", href: "/nearby?c=family" },
      { label: "Live music", icon: "Music", href: "/nearby?c=music" },
      { label: "Movies", icon: "Film", href: "/nearby?c=movies" },
      { label: "Arts & museums", icon: "Palette", href: "/nearby?c=art" },
      { label: "Libraries", icon: "Library", href: "/category/library" },
      { label: "Markers & landmarks", icon: "Landmark", href: "/markers" },
      { label: "Plan a day", icon: "Route", href: "/plan" },
    ],
  },
  {
    key: "shop",
    label: "Shop",
    icon: "ShoppingBag",
    color: "var(--app-cool)",
    subs: [
      { label: "Shops", icon: "ShoppingBag", href: "/nearby?c=shops" },
      { label: "Thrift & vintage", icon: "Armchair", href: "/nearby?c=shops&facet=thrift" },
      { label: "Home & décor", icon: "Sparkles", href: "/nearby?c=shops&facet=home" },
      { label: "Farmers markets", icon: "ShoppingBasket", href: "/category/market" },
      { label: "Books", icon: "BookOpen", href: "/category/book-store" },
    ],
  },
  {
    key: "unwind",
    label: "Wellness & stay",
    icon: "Heart",
    color: "var(--app-brand-2)",
    subs: [
      { label: "Wellness", icon: "Heart", href: "/nearby?c=wellness" },
      { label: "Salons & barbers", icon: "Scissors", href: "/nearby?c=salon" },
      { label: "Hotels & B&Bs", icon: "Hotel", href: "/nearby?c=stay" },
    ],
  },
  {
    key: "around",
    label: "Get around",
    icon: "Bus",
    color: "var(--app-cool)",
    subs: [
      { label: "Parking", icon: "ParkingCircle", href: "/parking" },
      { label: "MARC train", icon: "Train", href: "/transit" },
      { label: "Transit bus", icon: "Bus", href: "/transit" },
      { label: "Amenities", icon: "Wrench", href: "/amenities" },
      { label: "County pulse", icon: "Activity", href: "/pulse" },
      { label: "Contacts", icon: "Building2", href: "/contacts" },
    ],
  },
];
