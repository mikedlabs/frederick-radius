export type InteractionCandidate = {
  tagName: string;
  text: string;
  href: string | null;
  target: string | null;
  download: boolean;
  buttonType: string | null;
  disabled: boolean;
  role: string | null;
  ariaExpanded: string | null;
  ariaPressed: string | null;
  ariaHasPopup: string | null;
  crawlerPolicy: string | null;
};

export type InteractionDecision = {
  safe: boolean;
  kind: "navigation" | "disclosure" | "toggle" | "tab" | "none";
  reason: string;
};

const UNSAFE_LABEL =
  /\b(?:add to home|book|buy|checkout|claim|delete|drop my|email|enable notifications?|follow|install|log ?out|pay|purchase|remove|report|reserve|reset|save|send|sign ?in|sign ?out|submit|subscribe|unsubscribe|upload|use my location)\b/i;

const MUTATION_ROUTE =
  /^\/(?:api|admin|auth|business|claim|collect|food-trucks\/out|logout|push|report|settings|submit)(?:\/|$)/i;

const MUTATION_QUERY =
  /[?&](?:action|method)=(?:delete|post|put|patch|remove|reset|submit)\b/i;

const SAFE_BUTTON_LABEL =
  /^(?:back|cancel|close|done|filter|hide|map options|more|next|open|options|previous|retry|search|show|view)\b/i;

function hasMutationLabel(value: string): boolean {
  // "Find something to save" describes navigation into discovery; it is not
  // the act of saving. Remove that narrow noun phrase before applying the
  // mutation-verb denylist, while leaving labels such as "Remove something to
  // save" denied by their remaining verb.
  const normalized = value.replace(/\b(?:something|things?) to save\b/gi, "");
  return UNSAFE_LABEL.test(normalized);
}

function denied(reason: string): InteractionDecision {
  return { safe: false, kind: "none", reason };
}

/**
 * Conservative policy used by the browser crawler.
 *
 * The crawler may follow same-origin read-only links and exercise controls
 * whose semantics identify them as disclosures, toggles, or tabs. It never
 * submits a form, follows an external/contact/download link, or touches a
 * control with mutation-shaped language. `data-crawler-safe="false"` is an
 * explicit escape hatch for a control whose side effect is not obvious from
 * markup; `true` can opt in a type=button only after all deny rules pass.
 */
export function classifySafeInteraction(
  candidate: InteractionCandidate,
): InteractionDecision {
  const tag = candidate.tagName.toLowerCase();
  const text = candidate.text.replace(/\s+/g, " ").trim();

  if (candidate.crawlerPolicy === "false") {
    return denied("explicitly excluded");
  }
  if (candidate.disabled) return denied("disabled");
  // Labels are part of the safety contract for links as well as buttons.
  // Some older account systems still expose logout or other mutations as
  // same-origin GET links, so a harmless-looking href is not sufficient proof
  // that following it is observational.
  if (hasMutationLabel(text)) return denied("mutation-shaped label");

  if (tag === "a") {
    const href = candidate.href?.trim() ?? "";
    if (!href) return denied("missing destination");
    if (candidate.download) return denied("download");
    if (candidate.target && candidate.target.toLowerCase() !== "_self") {
      return denied("new browsing context");
    }
    if (href.startsWith("#")) {
      return { safe: true, kind: "navigation", reason: "same-page anchor" };
    }
    if (!href.startsWith("/") || href.startsWith("//")) {
      return denied("external or non-http action");
    }
    if (MUTATION_ROUTE.test(href) || MUTATION_QUERY.test(href)) {
      return denied("mutation-shaped route");
    }
    return { safe: true, kind: "navigation", reason: "same-origin read" };
  }

  if (tag !== "button") return denied("unsupported control");
  if ((candidate.buttonType ?? "submit").toLowerCase() !== "button") {
    return denied("form submission");
  }

  if (candidate.ariaExpanded === "true" || candidate.ariaExpanded === "false") {
    return { safe: true, kind: "disclosure", reason: "aria-expanded control" };
  }
  if (candidate.ariaPressed === "true" || candidate.ariaPressed === "false") {
    return { safe: true, kind: "toggle", reason: "aria-pressed control" };
  }
  if (candidate.role?.toLowerCase() === "tab") {
    return { safe: true, kind: "tab", reason: "tab control" };
  }
  if (
    candidate.ariaHasPopup &&
    candidate.ariaHasPopup.toLowerCase() !== "false"
  ) {
    return { safe: true, kind: "disclosure", reason: "popup control" };
  }
  if (candidate.crawlerPolicy === "true" || SAFE_BUTTON_LABEL.test(text)) {
    return { safe: true, kind: "disclosure", reason: "read-only control" };
  }
  return denied("side effect is not provably read-only");
}
