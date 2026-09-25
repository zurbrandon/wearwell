import type { Category, Pattern, Season, Slot } from '@/lib/taxonomy';

export type ItemSource = 'manual' | 'email';

export type Item = {
  id: string;
  name: string;
  category: Category;
  subcategory: string | null;
  brand: string | null;
  colors: string[];
  pattern: Pattern;
  /** 1 (loungewear) – 5 (formal). */
  formality: number;
  seasons: Season[];
  tags: string[];
  imageUri: string | null;
  notes: string | null;

  /** Provenance — `email` rows are written by the receipt importer. */
  source: ItemSource;
  retailer: string | null;
  /** Stable key from the source receipt, used to dedupe re-imports. */
  externalRef: string | null;
  price: number | null;
  currency: string | null;
  purchasedAt: number | null;

  /**
   * Bench = "stop showing me this". `benchedUntil` null means indefinitely,
   * until it's explicitly brought back.
   */
  benchedAt: number | null;
  benchedUntil: number | null;

  wearCount: number;
  lastWornAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type OutfitEntry = { slot: Slot; item: Item };

export type Outfit = {
  id: string;
  name: string | null;
  note: string | null;
  createdAt: number;
  /** Set when the outfit is cleared out of the working set. */
  archivedAt: number | null;
  favorite: boolean;
  wornCount: number;
  lastWornAt: number | null;
  entries: OutfitEntry[];
};

/**
 * A named grouping of outfits — a trip, a season, an occasion. Membership is
 * many-to-many, so one outfit can sit in several capsules.
 */
export type Capsule = {
  id: string;
  name: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  /** Denormalised for list rendering. */
  outfitCount: number;
  /** Distinct garments across every outfit in it — the packing list. */
  itemCount: number;
  /** A few cover images, newest outfit first. */
  preview: string[];
};

/**
 * A capsule or one of the built-in views, in the shape the library list needs.
 */
export type Collection = {
  id: string;
  name: string;
  kind: import('@/lib/collections').CollectionKind;
  outfitCount: number;
  /** Distinct garments — the packing list size. Only meaningful for capsules. */
  itemCount: number;
  preview: string[];
};

export type NewItem = Omit<
  Item,
  'id' | 'createdAt' | 'updatedAt' | 'wearCount' | 'lastWornAt' | 'benchedAt' | 'benchedUntil'
> &
  Partial<Pick<Item, 'id' | 'benchedAt' | 'benchedUntil'>>;

export function isBenched(item: Item, now = Date.now()): boolean {
  if (item.benchedAt == null) return false;
  if (item.benchedUntil == null) return true;
  return item.benchedUntil > now;
}
