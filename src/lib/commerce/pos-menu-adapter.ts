import type {
  NativeMenuDocument,
  NativeMenuSourceProvider,
} from "./native-menu-ingest";

export type PosMenuProvider = Extract<
  NativeMenuSourceProvider,
  "toast" | "square" | "clover"
>;

/**
 * A database reference to a merchant-authorized connection. Tokens and client
 * secrets belong in the platform's secret store and must never be returned in
 * this object or written into a menu snapshot.
 */
export interface PosMenuConnectionRef {
  connectionId: string;
  placeId: string;
  provider: PosMenuProvider;
  externalMerchantId: string;
  authorizedAt: string;
}

export interface PosMenuImportContext {
  connection: PosMenuConnectionRef;
  /** Public, restaurant-facing menu URL used for source attribution. */
  sourceUrl: string;
  checkedAt: string;
}

export interface PosMenuFetchResult {
  /** Opaque provider response; the adapter is responsible for validating it. */
  snapshot: unknown;
  publishedAt?: string;
}

/**
 * Contract for future Toast, Square, and Clover OAuth integrations.
 *
 * Implementations may call only the provider API authorized by `connection`.
 * They must not scrape public pages. The normalized result must pass the same
 * native-menu validator used for owner JSON/CSV uploads.
 */
export interface PosMenuAdapter {
  readonly provider: PosMenuProvider;
  fetchAuthorizedSnapshot(context: PosMenuImportContext): Promise<PosMenuFetchResult>;
  normalizeAuthorizedSnapshot(
    result: PosMenuFetchResult,
    context: PosMenuImportContext,
  ): NativeMenuDocument;
}

