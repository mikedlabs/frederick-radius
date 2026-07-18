export type EmergencyRequestKind = "pet" | "human-poison" | "human-emergency" | "urgent-care";

/** Safety-sensitive requests bypass fuzzy search and the model. Ordering is
 * deliberate: pet poison needs a veterinary toxicologist, not the human
 * poison line, while an ordinary "urgent care" lookup is not labeled an ER. */
export function emergencyRequestKind(query: string): EmergencyRequestKind | null {
  const pet = /\b(?:pet|dog|cat|puppy|kitten|animal|veterinary|vet)\b/i.test(query);
  const poison = /\b(?:poison(?:ed|ing)?|toxic|toxicity|overdose|swallowed|ate (?:chocolate|medication|medicine|rat poison)|ingested)\b/i.test(query);
  if (
    /\b(?:emergency vet|veterinary (?:emergency|er)|animal er|pet emergency|pet poison)\b/i.test(query) ||
    (pet && poison)
  ) return "pet";
  if (poison) return "human-poison";
  if (/\b(?:emergency room|nearest er|hospital er|medical emergency|call 911|ambulance|heart attack|stroke|trouble breathing|can(?:not|'t) breathe|uncontrolled bleeding)\b/i.test(query)) {
    return "human-emergency";
  }
  if (/\burgent care\b/i.test(query)) return "urgent-care";
  return null;
}
