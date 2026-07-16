const FOLLOW_UP_LANGUAGE = /^(?:and\s+)?(?:closer|cheaper|quieter|later|earlier|tomorrow|tonight|nearer|walking distance|make it|what about|how about|another|somewhere|instead|with kids|without kids)\b|\b(?:closer|cheaper|quieter|instead|walking distance)\b/i;

/** Expand only obvious short refinements. A complete new question should never
 * inherit stale context from the last answer. Keeping this deterministic also
 * makes the behavior identical whether the model path is available or not. */
export function contextualizeAskQuery(query: string, previousQuery: string | null): string {
  const next = query.trim();
  if (!previousQuery || next.length > 90 || !FOLLOW_UP_LANGUAGE.test(next)) return next;
  const previous = previousQuery.trim().slice(-220);
  return `${previous}. Follow-up: ${next}`.slice(0, 300);
}
