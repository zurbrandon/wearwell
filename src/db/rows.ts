import type { Category, Pattern, Season, Slot } from '@/lib/taxonomy';
import type { Item, ItemSource, Outfit } from '@/lib/types';

export type ItemRow = {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  brand: string | null;
  colors: string;
  pattern: string;
  formality: number;
  seasons: string;
  tags: string;
  image_uri: string | null;
  notes: string | null;
  source: string;
  retailer: string | null;
  external_ref: string | null;
  price: number | null;
  currency: string | null;
  purchased_at: number | null;
  benched_at: number | null;
  benched_until: number | null;
  wear_count: number;
  last_worn_at: number | null;
  created_at: number;
  updated_at: number;
};

export type OutfitRow = {
  id: string;
  name: string | null;
  note: string | null;
  created_at: number;
  archived_at: number | null;
  favorite: number;
  worn_count: number;
  last_worn_at: number | null;
};

function parseList(json: string): string[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Category,
    subcategory: row.subcategory,
    brand: row.brand,
    colors: parseList(row.colors),
    pattern: row.pattern as Pattern,
    formality: row.formality,
    seasons: parseList(row.seasons) as Season[],
    tags: parseList(row.tags),
    imageUri: row.image_uri,
    notes: row.notes,
    source: row.source as ItemSource,
    retailer: row.retailer,
    externalRef: row.external_ref,
    price: row.price,
    currency: row.currency,
    purchasedAt: row.purchased_at,
    benchedAt: row.benched_at,
    benchedUntil: row.benched_until,
    wearCount: row.wear_count,
    lastWornAt: row.last_worn_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toOutfit(row: OutfitRow): Omit<Outfit, 'entries'> {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    favorite: row.favorite === 1,
    wornCount: row.worn_count,
    lastWornAt: row.last_worn_at,
  };
}

export type OutfitItemRow = ItemRow & { outfit_id: string; slot: string; position: number };

export function toSlot(value: string): Slot {
  return value as Slot;
}
