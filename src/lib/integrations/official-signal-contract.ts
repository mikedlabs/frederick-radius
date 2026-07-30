/**
 * Shared truth contract for operational information published by a
 * government source.
 *
 * "Official" describes provenance, not certainty. NWS Local Storm Reports,
 * for example, are official products but remain preliminary observations.
 * Likewise, only a source that explicitly publishes an item in a current
 * alert feed may set `active: true`.
 */

export type OfficialSignalConfidence =
  | "official"
  | "preliminary-official";

export type OfficialSignalState = "active" | "recent" | "expired";

export type OfficialSignalProvenance = {
  publisher: string;
  authority: "official-government";
  sourceKind: "official-rss" | "nws-text-product";
  /** Machine-readable endpoint used for this record. */
  sourceUrl: string;
  /** Public page or official product URL a reader can open. */
  canonicalUrl: string;
  /** When Radius retrieved this source. */
  retrievedAt: string;
  /** Timestamp supplied by the provider, when one exists. */
  providerUpdatedAt: string | null;
  confidence: OfficialSignalConfidence;
};

export type OfficialOperationalSignalBase = {
  id: string;
  title: string;
  summary: string;
  url: string;
  scope: "city" | "county";
  state: OfficialSignalState;
  /**
   * True only when the publisher explicitly represents the record as current.
   * A recent observation is useful context but is not an active warning.
   */
  active: boolean;
  publishedAt: string | null;
  occurredAt: string | null;
  expiresAt: string | null;
  confidence: OfficialSignalConfidence;
  provenance: OfficialSignalProvenance;
};
