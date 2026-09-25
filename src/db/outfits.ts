import type { SQLiteDatabase } from 'expo-sqlite';

import { toItem, toOutfit, type ItemRow, type OutfitRow } from '@/db/rows';
import type { Slot } from '@/lib/taxonomy';
import type { Outfit, OutfitEntry } from '@/lib/types';

function newId(): string {
  return `fit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export type OutfitScope = 'active' | 'archived' | 'all';

/** Loads outfits plus their items in two queries rather than one per outfit. */
export async function listOutfits(
  db: SQLiteDatabase,
  scope: OutfitScope = 'active'
): Promise<Outfit[]> {
  const where =
    scope === 'active' ? 'WHERE archived_at IS NULL' : scope === 'archived' ? 'WHERE archived_at IS NOT NULL' : '';

  const rows = await db.getAllAsync<OutfitRow>(
    `SELECT * FROM outfits ${where} ORDER BY favorite DESC, created_at DESC`
  );
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const joins = await db.getAllAsync<ItemRow & { outfit_id: string; slot: string; position: number }>(
    `SELECT oi.outfit_id, oi.slot, oi.position, i.*
       FROM outfit_items oi
       JOIN items i ON i.id = oi.item_id
      WHERE oi.outfit_id IN (${ids.map(() => '?').join(', ')})
      ORDER BY oi.position ASC`,
    ids
  );

  const bySlotOrder = new Map<string, OutfitEntry[]>();
  for (const join of joins) {
    const entries = bySlotOrder.get(join.outfit_id) ?? [];
    entries.push({ slot: join.slot as Slot, item: toItem(join) });
    bySlotOrder.set(join.outfit_id, entries);
  }

  return rows.map((row) => ({ ...toOutfit(row), entries: bySlotOrder.get(row.id) ?? [] }));
}

export async function getOutfit(db: SQLiteDatabase, id: string): Promise<Outfit | null> {
  const row = await db.getFirstAsync<OutfitRow>('SELECT * FROM outfits WHERE id = ?', [id]);
  if (!row) return null;

  const joins = await db.getAllAsync<ItemRow & { slot: string }>(
    `SELECT oi.slot, i.* FROM outfit_items oi
       JOIN items i ON i.id = oi.item_id
      WHERE oi.outfit_id = ? ORDER BY oi.position ASC`,
    [id]
  );

  return {
    ...toOutfit(row),
    entries: joins.map((j) => ({ slot: j.slot as Slot, item: toItem(j) })),
  };
}

export async function createOutfit(
  db: SQLiteDatabase,
  entries: { slot: Slot; itemId: string }[],
  meta: { name?: string | null; note?: string | null } = {}
): Promise<string> {
  const id = newId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO outfits (id, name, note, created_at, favorite, worn_count) VALUES (?, ?, ?, ?, 0, 0)',
      [id, meta.name ?? null, meta.note ?? null, Date.now()]
    );

    for (const [position, entry] of entries.entries()) {
      await db.runAsync(
        'INSERT INTO outfit_items (outfit_id, item_id, slot, position) VALUES (?, ?, ?, ?)',
        [id, entry.itemId, entry.slot, position]
      );
    }
  });

  return id;
}

export async function deleteOutfit(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM outfits WHERE id = ?', [id]);
}

export async function setFavorite(db: SQLiteDatabase, id: string, favorite: boolean): Promise<void> {
  await db.runAsync('UPDATE outfits SET favorite = ? WHERE id = ?', [favorite ? 1 : 0, id]);
}

export async function renameOutfit(db: SQLiteDatabase, id: string, name: string | null): Promise<void> {
  await db.runAsync('UPDATE outfits SET name = ? WHERE id = ?', [name, id]);
}

/**
 * "Clear" is non-destructive: outfits move to the archive so a cleared batch
 * can still be recovered. Favorites are kept in the working set by default, and
 * anything filed into a capsule is always kept — clearing the queue shouldn't
 * gut a trip you've planned.
 */
export async function archiveOutfits(
  db: SQLiteDatabase,
  opts: { keepFavorites?: boolean } = {}
): Promise<number> {
  const keep = opts.keepFavorites ?? true;
  const result = await db.runAsync(
    `UPDATE outfits SET archived_at = ?
      WHERE archived_at IS NULL
        ${keep ? 'AND favorite = 0' : ''}
        AND id NOT IN (SELECT outfit_id FROM capsule_outfits)`,
    [Date.now()]
  );
  return result.changes;
}

/** How many outfits a Clear would actually move, for an honest confirm dialog. */
export async function clearableCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outfits
      WHERE archived_at IS NULL AND favorite = 0
        AND id NOT IN (SELECT outfit_id FROM capsule_outfits)`
  );
  return row?.n ?? 0;
}

export async function archiveOutfit(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE outfits SET archived_at = ? WHERE id = ?', [Date.now(), id]);
}

export async function restoreOutfit(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE outfits SET archived_at = NULL WHERE id = ?', [id]);
}

/** Marks an outfit worn, and rolls the wear through to each item in it. */
export async function markWorn(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE outfits SET worn_count = worn_count + 1, last_worn_at = ? WHERE id = ?',
      [now, id]
    );
    await db.runAsync(
      `UPDATE items SET wear_count = wear_count + 1, last_worn_at = ?
        WHERE id IN (SELECT item_id FROM outfit_items WHERE outfit_id = ?)`,
      [now, id]
    );
  });
}

/**
 * Outfits a given piece appears in, newest first — the reverse of
 * `outfit.entries`, so an item can point back at where it's worn.
 */
export async function outfitsForItem(db: SQLiteDatabase, itemId: string): Promise<Outfit[]> {
  const rows = await db.getAllAsync<OutfitRow>(
    `SELECT o.* FROM outfit_items oi
       JOIN outfits o ON o.id = oi.outfit_id
      WHERE oi.item_id = ?
      ORDER BY o.created_at DESC`,
    [itemId]
  );
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const joins = await db.getAllAsync<ItemRow & { outfit_id: string; slot: string }>(
    `SELECT oi.outfit_id, oi.slot, i.*
       FROM outfit_items oi
       JOIN items i ON i.id = oi.item_id
      WHERE oi.outfit_id IN (${ids.map(() => '?').join(', ')})
      ORDER BY oi.position ASC`,
    ids
  );

  const entries = new Map<string, OutfitEntry[]>();
  for (const join of joins) {
    const list = entries.get(join.outfit_id) ?? [];
    list.push({ slot: join.slot as Slot, item: toItem(join) });
    entries.set(join.outfit_id, list);
  }

  return rows.map((row) => ({ ...toOutfit(row), entries: entries.get(row.id) ?? [] }));
}

/** Item ids already used by outfits in the working set, for variety scoring. */
export async function activeOutfitItemIds(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ item_id: string }>(
    `SELECT DISTINCT oi.item_id FROM outfit_items oi
       JOIN outfits o ON o.id = oi.outfit_id
      WHERE o.archived_at IS NULL`
  );
  return new Set(rows.map((r) => r.item_id));
}

export async function countOutfits(db: SQLiteDatabase, scope: OutfitScope = 'active'): Promise<number> {
  const where =
    scope === 'active' ? 'WHERE archived_at IS NULL' : scope === 'archived' ? 'WHERE archived_at IS NOT NULL' : '';
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outfits ${where}`);
  return row?.n ?? 0;
}
