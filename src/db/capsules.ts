import type { SQLiteDatabase } from 'expo-sqlite';

import { toItem, toOutfit, type ItemRow, type OutfitRow } from '@/db/rows';
import type { Slot } from '@/lib/taxonomy';
import type { Capsule, Item, Outfit } from '@/lib/types';

function newId(): string {
  return `cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

type CapsuleRow = {
  id: string;
  name: string;
  note: string | null;
  created_at: number;
  updated_at: number;
  outfit_count: number;
  item_count: number;
};

/**
 * Counts are computed in SQL rather than by hydrating every outfit: the list
 * only needs totals, and `item_count` is a DISTINCT across the capsule's
 * outfits so a shirt worn in three looks is packed once.
 */
const LIST_SQL = `
  SELECT c.*,
         (SELECT COUNT(*) FROM capsule_outfits co WHERE co.capsule_id = c.id) AS outfit_count,
         (SELECT COUNT(DISTINCT oi.item_id)
            FROM capsule_outfits co
            JOIN outfit_items oi ON oi.outfit_id = co.outfit_id
           WHERE co.capsule_id = c.id) AS item_count
    FROM capsules c
   ORDER BY c.updated_at DESC
`;

export async function listCapsules(db: SQLiteDatabase): Promise<Capsule[]> {
  const rows = await db.getAllAsync<CapsuleRow>(LIST_SQL);
  if (!rows.length) return [];

  // One extra query for cover art across every capsule, rather than per row.
  const previews = await db.getAllAsync<{ capsule_id: string; image_uri: string | null }>(
    `SELECT co.capsule_id, i.image_uri
       FROM capsule_outfits co
       JOIN outfit_items oi ON oi.outfit_id = co.outfit_id
       JOIN items i ON i.id = oi.item_id
      WHERE i.image_uri IS NOT NULL
      ORDER BY co.added_at DESC, oi.position ASC`
  );

  const byCapsule = new Map<string, string[]>();
  for (const row of previews) {
    const list = byCapsule.get(row.capsule_id) ?? [];
    if (list.length < 4 && row.image_uri && !list.includes(row.image_uri)) {
      list.push(row.image_uri);
    }
    byCapsule.set(row.capsule_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    outfitCount: row.outfit_count,
    itemCount: row.item_count,
    preview: byCapsule.get(row.id) ?? [],
  }));
}

export async function getCapsule(db: SQLiteDatabase, id: string): Promise<Capsule | null> {
  const row = await db.getFirstAsync<CapsuleRow>(
    LIST_SQL.replace('ORDER BY c.updated_at DESC', 'WHERE c.id = ?'),
    [id]
  );
  if (!row) return null;

  const previews = await db.getAllAsync<{ image_uri: string }>(
    `SELECT DISTINCT i.image_uri
       FROM capsule_outfits co
       JOIN outfit_items oi ON oi.outfit_id = co.outfit_id
       JOIN items i ON i.id = oi.item_id
      WHERE co.capsule_id = ? AND i.image_uri IS NOT NULL
      LIMIT 4`,
    [id]
  );

  return {
    id: row.id,
    name: row.name,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    outfitCount: row.outfit_count,
    itemCount: row.item_count,
    preview: previews.map((p) => p.image_uri),
  };
}

export async function createCapsule(db: SQLiteDatabase, name: string): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO capsules (id, name, note, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)',
    [id, name.trim() || 'Untitled capsule', now, now]
  );
  return id;
}

export async function renameCapsule(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  await db.runAsync('UPDATE capsules SET name = ?, updated_at = ? WHERE id = ?', [
    name.trim() || 'Untitled capsule',
    Date.now(),
    id,
  ]);
}

export async function deleteCapsule(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM capsules WHERE id = ?', [id]);
}

/** Adding is idempotent, so re-adding from a picker can't fail. */
export async function addOutfitsToCapsule(
  db: SQLiteDatabase,
  capsuleId: string,
  outfitIds: string[]
): Promise<void> {
  if (!outfitIds.length) return;
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    for (const outfitId of outfitIds) {
      await db.runAsync(
        'INSERT OR IGNORE INTO capsule_outfits (capsule_id, outfit_id, added_at) VALUES (?, ?, ?)',
        [capsuleId, outfitId, now]
      );
    }
    await db.runAsync('UPDATE capsules SET updated_at = ? WHERE id = ?', [now, capsuleId]);
  });
}

export async function removeOutfitFromCapsule(
  db: SQLiteDatabase,
  capsuleId: string,
  outfitId: string
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM capsule_outfits WHERE capsule_id = ? AND outfit_id = ?', [
      capsuleId,
      outfitId,
    ]);
    await db.runAsync('UPDATE capsules SET updated_at = ? WHERE id = ?', [Date.now(), capsuleId]);
  });
}

/**
 * Outfits in a capsule, regardless of whether they've been cleared from the
 * working queue — a capsule is a durable curation, not a view of the queue.
 */
export async function capsuleOutfits(db: SQLiteDatabase, capsuleId: string): Promise<Outfit[]> {
  const rows = await db.getAllAsync<OutfitRow>(
    `SELECT o.* FROM capsule_outfits co
       JOIN outfits o ON o.id = co.outfit_id
      WHERE co.capsule_id = ?
      ORDER BY co.added_at DESC`,
    [capsuleId]
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

  const entries = new Map<string, Outfit['entries']>();
  for (const join of joins) {
    const list = entries.get(join.outfit_id) ?? [];
    list.push({ slot: join.slot as Slot, item: toItem(join) });
    entries.set(join.outfit_id, list);
  }

  return rows.map((row) => ({ ...toOutfit(row), entries: entries.get(row.id) ?? [] }));
}

/** Every distinct garment the capsule needs — i.e. what to pack. */
export async function capsuleItems(db: SQLiteDatabase, capsuleId: string): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT DISTINCT i.* FROM capsule_outfits co
       JOIN outfit_items oi ON oi.outfit_id = co.outfit_id
       JOIN items i ON i.id = oi.item_id
      WHERE co.capsule_id = ?`,
    [capsuleId]
  );
  return rows.map(toItem);
}

/** Suggestion signatures the user has thrown away for this capsule. */
export async function dismissedSuggestions(
  db: SQLiteDatabase,
  capsuleId: string
): Promise<string[]> {
  const rows = await db.getAllAsync<{ signature: string }>(
    'SELECT signature FROM capsule_dismissed WHERE capsule_id = ?',
    [capsuleId]
  );
  return rows.map((r) => r.signature);
}

export async function dismissSuggestion(
  db: SQLiteDatabase,
  capsuleId: string,
  signature: string
): Promise<void> {
  await db.runAsync(
    'INSERT OR IGNORE INTO capsule_dismissed (capsule_id, signature, dismissed_at) VALUES (?, ?, ?)',
    [capsuleId, signature, Date.now()]
  );
}

/** Bring dismissed suggestions back — for when a capsule has run dry. */
export async function clearDismissed(db: SQLiteDatabase, capsuleId: string): Promise<void> {
  await db.runAsync('DELETE FROM capsule_dismissed WHERE capsule_id = ?', [capsuleId]);
}

/** Item ids already ticked off this capsule's packing list. */
export async function packedItems(db: SQLiteDatabase, capsuleId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ item_id: string }>(
    'SELECT item_id FROM capsule_packed WHERE capsule_id = ?',
    [capsuleId]
  );
  return rows.map((r) => r.item_id);
}

export async function setPacked(
  db: SQLiteDatabase,
  capsuleId: string,
  itemId: string,
  packed: boolean
): Promise<void> {
  if (packed) {
    await db.runAsync(
      'INSERT OR REPLACE INTO capsule_packed (capsule_id, item_id, packed_at) VALUES (?, ?, ?)',
      [capsuleId, itemId, Date.now()]
    );
    return;
  }
  await db.runAsync('DELETE FROM capsule_packed WHERE capsule_id = ? AND item_id = ?', [
    capsuleId,
    itemId,
  ]);
}

/** Unpack everything — for reusing a capsule on the next trip. */
export async function resetPacked(db: SQLiteDatabase, capsuleId: string): Promise<void> {
  await db.runAsync('DELETE FROM capsule_packed WHERE capsule_id = ?', [capsuleId]);
}

/** Capsule ids an outfit already belongs to, for the add-to-capsule sheet. */
export async function capsulesForOutfit(db: SQLiteDatabase, outfitId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ capsule_id: string }>(
    'SELECT capsule_id FROM capsule_outfits WHERE outfit_id = ?',
    [outfitId]
  );
  return rows.map((r) => r.capsule_id);
}
