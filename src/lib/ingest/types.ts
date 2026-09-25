import type { Category, Pattern, Season } from '@/lib/taxonomy';

/**
 * The shape a receipt parser must produce. Everything except `externalRef` and
 * `name` is optional — a receipt rarely tells you the pattern or formality, so
 * the importer fills in defaults and flags the item for review.
 */
export type ParsedPurchase = {
  /**
   * Stable identity for this line item, e.g. `${retailer}:${orderId}:${sku}`.
   * Re-importing the same receipt must produce the same value — it's the
   * dedupe key, enforced by a unique index on (source, external_ref).
   */
  externalRef: string;
  name: string;
  retailer: string | null;
  brand?: string | null;
  category?: Category;
  subcategory?: string | null;
  colors?: string[];
  pattern?: Pattern;
  formality?: number;
  seasons?: Season[];
  /** Remote image from the receipt; downloaded into local storage on import. */
  imageUrl?: string | null;
  price?: number | null;
  currency?: string | null;
  purchasedAt?: number | null;
};

export type ParseResult = {
  purchases: ParsedPurchase[];
  /** Messages the parser recognised as receipts but could not read. */
  skipped: { reason: string; subject?: string }[];
};

/**
 * A source of purchase emails.
 *
 * Nothing implements this yet. When it does, the likely shape is a server-side
 * job (Gmail/Outlook OAuth, an LLM pass over the message body to extract line
 * items) that hands `ParsedPurchase[]` back to the device — mailbox credentials
 * should not live in the app. `importPurchases` below is the device-side sink
 * and is already wired to the database, so only the fetch and parse steps are
 * outstanding.
 */
export interface ReceiptSource {
  readonly id: string;
  readonly label: string;
  /** Pulls and parses receipts newer than `since`. */
  fetchSince(since: number | null): Promise<ParseResult>;
}
