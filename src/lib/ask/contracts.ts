import type { AskIntent } from "@/lib/ask/intent";
import type { CountyRegion } from "@/data/county-regions";

export type AskSource = {
  slug: string;
  name: string;
  category: string;
  city?: string;
  href: string;
  eyebrow?: string;
  reason?: string;
  detail?: string;
  distance?: string;
  status?: string;
  phone?: string;
  email?: string;
  region?: CountyRegion;
  confidence?: "high" | "medium";
  /**
   * Server assertion that this exact source is the primary result of a
   * discovery ranking. Omit it for citations and retrieval-order sources.
   */
  isPrimaryRankedResult?: true;
  photo_url?: string;
  /** Google rating (0-5) + review count — the strongest trust signal, shown on
   *  the source card. ~90% of places carry one. */
  rating?: number;
  ratingCount?: number;
};

export type AskAction =
  | {
      label: string;
      kind: "refine";
      query: string;
      href?: never;
    }
  | {
      label: string;
      kind: "open";
      href: string;
      query?: never;
    };

export type AskPlanPreview = {
  title: string;
  summary: string;
  /** "Today", "Tomorrow", or a dated weekday for plans farther ahead. */
  dateLabel: string;
  href: string;
  stops: Array<{
    order: number;
    time: string;
    name: string;
    category: string;
    href: string;
    /** Verified place or event image. Google place photos always stay behind
     * the key-safe Radius proxy and open into the attributed place view. */
    photo_url?: string;
    why: string;
    status: string;
    tip?: string;
  }>;
};

export type AskIntelligence = {
  tools: string[];
  confidence: "high" | "medium";
  retrieval: "keyword" | "hybrid";
  personalized?: string;
};

/**
 * A small server-owned reading contract for Ask's different answer shapes.
 * The client uses this to put the useful decision before supporting prose
 * without guessing from card order or clipping a paragraph with CSS.
 */
export type AskResponsePresentation = {
  layout: "plan" | "place" | "civic" | "standard" | "recovery";
  /** A complete sentence copied from grounded answer data. */
  summary: string | null;
  /** Remaining grounded prose, shown after the primary decision surface. */
  detail: string | null;
};

export type AskResult = {
  status: "answered" | "matches" | "empty";
  configured: boolean;
  usedModel: boolean;
  answer: string | null;
  sources: AskSource[];
  context?: string | null;
  intent?: AskIntent;
  actions?: AskAction[];
  plan?: AskPlanPreview | null;
  intelligence?: AskIntelligence;
  presentation?: AskResponsePresentation;
};
