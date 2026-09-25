import type { SQLiteDatabase } from 'expo-sqlite';

import { toItem, type ItemRow } from '@/db/rows';
import type { Category } from '@/lib/taxonomy';
import type { Item, NewItem } from '@/lib/types';

const SELECT = 'SELECT * FROM items';

function newId(): string {
  return `itm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export type ItemFilter = {
  categories?: Category[];
  search?: string;
  /** 'active' hides benched items, 'benched' shows only them. */
  bench?: 'active' | 'benched' | 'all';
};

export async function listItems(db: SQLiteDatabase, filter: ItemFilter = {}): Promise<Item[]> {
  const { categories, search, bench = 'active' } = filter;
  const where: string[] = [];
  const args: (string | number)[] = [];

  if (categories?.length) {
    where.push(`category IN (${categories.map(() => '?').join(', ')})`);
    args.push(...categories);
  }

  if (search?.trim()) {
    where.push('(name LIKE ? OR brand LIKE ? OR subcategory LIKE ? OR tags LIKE ?)');
    const like = `%${search.trim()}%`;
    args.push(like, like, like, like);
  }

  if (bench === 'active') {
    where.push('(benched_at IS NULL OR (benched_until IS NOT NULL AND benched_until <= ?))');
    args.push(Date.now());
  } else if (bench === 'benched') {
    where.push('(benched_at IS NOT NULL AND (benched_until IS NULL OR benched_until > ?))');
    args.push(Date.now());
  }

  const sql = [SELECT, where.length ? `WHERE ${where.join(' AND ')}` : '', 'ORDER BY created_at DESC']
    .filter(Boolean)
    .join(' ');

  const rows = await db.getAllAsync<ItemRow>(sql, args);
  return rows.map(toItem);
}

export async function getItem(db: SQLiteDatabase, id: string): Promise<Item | null> {
  const row = await db.getFirstAsync<ItemRow>(`${SELECT} WHERE id = ?`, [id]);
  return row ? toItem(row) : null;
}

export async function createItem(db: SQLiteDatabase, input: NewItem): Promise<string> {
  const id = input.id ?? newId();
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO items (
       id, name, category, subcategory, brand, colors, pattern, formality, seasons, tags,
       image_uri, notes, source, retailer, external_ref, price, currency, purchased_at,
       benched_at, benched_until, wear_count, last_worn_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [
      id,
      input.name,
      input.category,
      input.subcategory,
      input.brand,
      JSON.stringify(input.colors),
      input.pattern,
      input.formality,
      JSON.stringify(input.seasons),
      JSON.stringify(input.tags),
      input.imageUri,
      input.notes,
      input.source,
      input.retailer,
      input.externalRef,
      input.price,
      input.currency,
      input.purchasedAt,
      input.benchedAt ?? null,
      input.benchedUntil ?? null,
      now,
      now,
    ]
  );

  return id;
}

const UPDATABLE = {
  name: (v: unknown) => v as string,
  category: (v: unknown) => v as string,
  subcategory: (v: unknown) => v as string | null,
  brand: (v: unknown) => v as string | null,
  colors: (v: unknown) => JSON.stringify(v),
  pattern: (v: unknown) => v as string,
  formality: (v: unknown) => v as number,
  seasons: (v: unknown) => JSON.stringify(v),
  tags: (v: unknown) => JSON.stringify(v),
  imageUri: (v: unknown) => v as string | null,
  notes: (v: unknown) => v as string | null,
  retailer: (v: unknown) => v as string | null,
  price: (v: unknown) => v as number | null,
  currency: (v: unknown) => v as string | null,
  purchasedAt: (v: unknown) => v as number | null,
  benchedAt: (v: unknown) => v as number | null,
  benchedUntil: (v: unknown) => v as number | null,
} as const;

const COLUMN: Record<keyof typeof UPDATABLE, string> = {
  name: 'name',
  category: 'category',
  subcategory: 'subcategory',
  brand: 'brand',
  colors: 'colors',
  pattern: 'pattern',
  formality: 'formality',
  seasons: 'seasons',
  tags: 'tags',
  imageUri: 'image_uri',
  notes: 'notes',
  retailer: 'retailer',
  price: 'price',
  currency: 'currency',
  purchasedAt: 'purchased_at',
  benchedAt: 'benched_at',
  benchedUntil: 'benched_until',
};

export async function updateItem(
  db: SQLiteDatabase,
  id: string,
  patch: Partial<Record<keyof typeof UPDATABLE, unknown>>
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  for (const key of Object.keys(patch) as (keyof typeof UPDATABLE)[]) {
    if (!(key in UPDATABLE)) continue;
    sets.push(`${COLUMN[key]} = ?`);
    args.push(UPDATABLE[key](patch[key]) as string | number | null);
  }

  if (!sets.length) return;

  sets.push('updated_at = ?');
  args.push(Date.now(), id);

  await db.runAsync(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`, args);
}

export async function deleteItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
}

/** `until` of null benches indefinitely — it stays out until brought back. */
export async function benchItem(
  db: SQLiteDatabase,
  id: string,
  until: number | null = null
): Promise<void> {
  await updateItem(db, id, { benchedAt: Date.now(), benchedUntil: until });
}

export async function unbenchItem(db: SQLiteDatabase, id: string): Promise<void> {
  await updateItem(db, id, { benchedAt: null, benchedUntil: null });
}

export async function countItems(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM items');
  return row?.n ?? 0;
}

/** Relative image paths still referenced by an item. */
export async function referencedImages(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ image_uri: string }>(
    'SELECT image_uri FROM items WHERE image_uri IS NOT NULL'
  );
  return new Set(rows.map((r) => r.image_uri));
}

/** Every tag in use, most-used first — powers tag autocomplete on the editor. */
export async function allTags(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ tags: string }>('SELECT tags FROM items');
  const counts = new Map<string, number>();

  for (const row of rows) {
    try {
      for (const tag of JSON.parse(row.tags) as string[]) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    } catch {
      // A malformed tags blob shouldn't break autocomplete.
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}
