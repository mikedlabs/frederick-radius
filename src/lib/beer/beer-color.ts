/**
 * A realistic beer color for each pour, derived from its style — the pale
 * gold of a pilsner through the copper of an amber to the near-black of an
 * imperial stout. This drives the /beer color mosaic, where every beer is a
 * tile in its own color and the wall sorts light to dark.
 *
 * Not a lab value (we have no SRM in the data), but a faithful, ordered
 * keyword map over the real style strings, with the style's family as the
 * fallback so nothing lands gray. Pure + deterministic.
 */
import { FAMILY_BY_KEY, type StyleFamily } from "@/data/beers";

/** Ordered most-specific/darkest first; first hit wins. Tuned to read as beer
 *  on the warm #f5eee2 /beer ground. */
const STYLE_COLORS: { re: RegExp; hex: string }[] = [
  { re: /imperial stout|pastry stout|barrel[- ]?aged stout/, hex: "#180d07" },
  { re: /stout/, hex: "#20130b" },
  { re: /schwarz|black lager|black ipa|cascadian/, hex: "#241812" },
  { re: /porter/, hex: "#2c1c12" },
  { re: /coffee|mocha|chocolate/, hex: "#341f15" },
  { re: /barleywine|old ale/, hex: "#6a3714" },
  { re: /quad(rupel)?|belgian strong dark|dubbel|wee heavy|scotch ale/, hex: "#6b3a17" },
  { re: /brown|dunkelweizen|dunkel|bock|nut/, hex: "#7a441c" },
  { re: /amber|red ale|irish red|m(a|ä)rzen|oktoberfest|vienna|red ipa/, hex: "#a8571f" },
  { re: /rye/, hex: "#b06526" },
  { re: /double hazy|hazy double|triple ipa|double ipa|dipa|imperial ipa/, hex: "#d08a26" },
  { re: /hazy|new england|neipa|juicy/, hex: "#e0932e" },
  { re: /west coast|american ipa|session ipa|\bipa\b/, hex: "#d68a20" },
  { re: /pale ale|xpa|\bapa\b|extra pale/, hex: "#d99e2f" },
  { re: /hefe|weiss|witbier|\bwit\b|wheat|weizen/, hex: "#e7c65f" },
  { re: /tripel|strong golden|blonde|golden|k(o|ö)lsch|cream ale|table beer|helles|saison|farmhouse/, hex: "#e2aa2e" },
  { re: /pils|pilsner|lager|light lager|mexican lager/, hex: "#edc84a" },
  { re: /hibiscus|guava|passion|mango|raspberr|strawberr|cherry|blackberr|fruited|fruit /, hex: "#bb3f5f" },
  { re: /gose|berliner/, hex: "#e0a06f" },
  { re: /sour|flanders|wild|funk|brett/, hex: "#c05070" },
];

/** Deep-ish family fallbacks (its base is often too light for a solid tile). */
function familyColor(family: StyleFamily): string {
  return FAMILY_BY_KEY[family]?.base ?? "#b07a2c";
}

export function beerColor(style: string | undefined, family: StyleFamily): string {
  const s = (style ?? "").toLowerCase();
  for (const { re, hex } of STYLE_COLORS) {
    if (re.test(s)) return hex;
  }
  return familyColor(family);
}

/** Relative luminance 0 (black) .. 1 (white) for sorting light -> dark and
 *  choosing readable text on each tile. */
export function colorLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Text that clears contrast on a given beer-color tile. */
export function textOn(hex: string): string {
  return colorLuminance(hex) > 0.42 ? "#281e14" : "#fbf3e6";
}
