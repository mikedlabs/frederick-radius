/**
 * Communication-access facts that an event publisher states explicitly.
 *
 * Radius never infers that a general venue has an interpreter, captions, or
 * assistive-listening equipment. The only institutional shortcut is an event
 * published by the Maryland School for the Deaf: that qualifies as Deaf
 * community programming, but it still does not claim a specific accommodation.
 */
export type CommunicationAccessFeature =
  | "deaf_community"
  | "asl"
  | "asl_interpreted"
  | "captions"
  | "assistive_listening"
  | "interpreter_by_request";

type EventAccessInput = {
  title: string;
  description?: string | null;
  source?: string | null;
  source_label?: string | null;
  venue_name?: string | null;
  organizer?: string | null;
};

function eventAccessText(event: EventAccessInput): string {
  return [
    event.title,
    event.description,
    event.source_label,
    event.venue_name,
    event.organizer,
  ]
    .filter(Boolean)
    // Keep fields as separate clauses so an interpreter-request sentence in
    // the description cannot suppress an explicit "ASL class" title.
    .join(". ");
}

const DEAF_COMMUNITY_RE =
  /\b(?:deaf(?:blind)?|hard[-\s]of[-\s]hearing|maryland school for the deaf|maryland deaf community center)\b/i;
const ASL_RE =
  /\b(?:ASL|American Sign Language|ASL[-\s]immersive|signing stor(?:y|ies))\b/i;
const ASL_INTERPRETED_RE =
  /\b(?:ASL[-\s]interpreted|interpreted\s+(?:in|into)\s+ASL|ASL\s+interpreters?\s+(?:will\s+be|are|provided|available|on[-\s]?site)|American Sign Language\s+interpretation\s+(?:will\s+be|is)\s+(?:provided|available))\b/i;
const CAPTIONS_RE =
  /\b(?:(?:open|closed|live)\s+captions?|captioned|captioning|CART)\b/i;
const ASSISTIVE_LISTENING_RE =
  /\bassistive[-\s]listening\s+(?:devices?|systems?|equipment)\b/i;
const INTERPRETER_REQUEST_RE =
  /\b(?:(?:request|reserve|arrange)\w*[^.]{0,60}(?:ASL|sign language|interpreter)|(?:ASL|sign language|interpreter)[^.]{0,60}(?:request|reserve|arrange)\w*)\b/i;

export function eventCommunicationAccess(
  event: EventAccessInput,
): CommunicationAccessFeature[] {
  const text = eventAccessText(event);
  const features = new Set<CommunicationAccessFeature>();

  if (
    event.source === "msd" ||
    event.source === "mdcc" ||
    DEAF_COMMUNITY_RE.test(text)
  ) {
    features.add("deaf_community");
  }
  if (ASL_RE.test(text)) features.add("asl");
  if (ASL_INTERPRETED_RE.test(text)) {
    features.add("asl");
    features.add("asl_interpreted");
  }
  if (CAPTIONS_RE.test(text)) features.add("captions");
  if (ASSISTIVE_LISTENING_RE.test(text)) {
    features.add("assistive_listening");
  }
  if (INTERPRETER_REQUEST_RE.test(text)) {
    features.add("interpreter_by_request");
  }

  return [...features];
}

export function hasDeafCommunityOrCommunicationAccess(
  event: EventAccessInput,
): boolean {
  return eventCommunicationAccess(event).length > 0;
}

export function communicationAccessLabels(
  event: EventAccessInput,
): string[] {
  const features = new Set(eventCommunicationAccess(event));
  const labels: string[] = [];
  const hasStandaloneAsl = eventAccessText(event)
    .split(/[.!?;\n]+/)
    .some((clause) => ASL_RE.test(clause) && !INTERPRETER_REQUEST_RE.test(clause));

  if (features.has("asl_interpreted")) labels.push("ASL interpreted");
  else if (features.has("asl") && hasStandaloneAsl) labels.push("ASL");
  if (features.has("captions")) labels.push("Captions");
  if (features.has("assistive_listening")) labels.push("Assistive listening");
  if (features.has("interpreter_by_request")) {
    labels.push("Interpreter by request");
  }
  if (
    features.has("deaf_community") &&
    !features.has("asl") &&
    !features.has("asl_interpreted")
  ) {
    labels.push("Deaf community");
  }

  return labels;
}
