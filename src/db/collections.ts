import type { SQLiteDatabase } from 'expo-sqlite';

import { listCapsules } from '@/db/capsules';
import { toItem, toOutfit, type ItemRow, type OutfitRow } from '@/db/rows';
import { COLLECTION_NAME, collectionKind, type VirtualCollectionId } from '@/lib/collections';
import type { Slot } from '@/lib/taxonomy';
import type { Collection, Outfit } from '@/lib/types';

/** The WHERE clause selecting each built-in collection's outfits. */
const VIRTUAL_WHERE: Record<VirtualCollectionId, string> = {
  all: 'o.archived_at IS NULL',
  favorites: 'o.archived_at IS NULL AND o.favorite = 1',
  archived: 'o.archived_at IS NOT NULL',
};

async function virtualPreview(db: SQLiteDatabase, id: VirtualCollectionId): Promise<string[]> {
  const rows = await db.getAllAsync<{ image_uri: string }>(
    `SELECT DISTINCT i.image_uri
       FROM outfits o
       JOIN outfit_items oi ON oi.outfit_id = o.id
       JOIN items i ON i.id = oi.item_id
      WHERE ${VIRTUAL_WHERE[id]} AND i.image_uri IS NOT NULL
      ORDER BY o.created_at DESC
      LIMIT 4`
  );
  return rows.map((r) => r.image_uri);
}

/**
 * The library: built-in collections first, then the user's capsules. Archived
 * is omitted while empty — an empty recovery view is just noise.
 */
export async function listCollections(db: SQLiteDatabase): Promise<Collection[]> {
  const counts = await db.getFirstAsync<{ n_all: number; n_fav: number; n_arch: number }>(
    `SELECT
       SUM(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END) AS n_all,
       SUM(CASE WHEN archived_at IS NULL AND favorite = 1 THEN 1 ELSE 0 END) AS n_fav,
       SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) AS n_arch
     FROM outfits`
  );

  const built: Collection[] = [
    {
      id: 'all',
      name: COLLECTION_NAME.all,
      kind: 'all',
      outfitCount: counts?.n_all ?? 0,
      itemCount: 0,
      preview: await virtualPreview(db, 'all'),
    },
    {
      id: 'favorites',
      name: COLLECTION_NAME.favorites,
      kind: 'favorites',
      outfitCount: counts?.n_fav ?? 0,
      itemCount: 0,
      preview: await virtualPreview(db, 'favorites'),
    },
  ];

  const capsules = await listCapsules(db);
  const collections: Collection[] = [
    ...built,
    ...capsules.map((capsule) => ({
      id: capsule.id,
      name: capsule.name,
      kind: 'capsule' as const,
      outfitCount: capsule.outfitCount,
      itemCount: capsule.itemCount,
      preview: capsule.preview,
    })),
  ];

  if ((counts?.n_arch ?? 0) > 0) {
    collections.push({
      id: 'archived',
      name: COLLECTION_NAME.archived,
      kind: 'archived',
      outfitCount: counts?.n_arch ?? 0,
      itemCount: 0,
      preview: await virtualPreview(db, 'archived'),
    });
  }

  return collections;
}

export async function getCollection(db: SQLiteDatabase, id: string): Promise<Collection | null> {
  const all = await listCollections(db);
  const found = all.find((collection) => collection.id === id);
  if (found) return found;

  // Archived is hidden from the library once empty, but is still reachable by
  // id — e.g. from a link held open while the last one was restored.
  if (collectionKind(id) === 'archived') {
    return {
      id: 'archived',
      name: COLLECTION_NAME.archived,
      kind: 'archived',
      outfitCount: 0,
      itemCount: 0,
      preview: [],
    };
  }

  return null;
}

/** Hydrated outfits for any collection, built-in or capsule. */
export async function collectionOutfits(db: SQLiteDatabase, id: string): Promise<Outfit[]> {
  const kind = collectionKind(id);

  const rows =
    kind === 'capsule'
      ? await db.getAllAsync<OutfitRow>(
          `SELECT o.* FROM capsule_outfits co
             JOIN outfits o ON o.id = co.outfit_id
            WHERE co.capsule_id = ?
            ORDER BY co.added_at DESC`,
          [id]
        )
      : await db.getAllAsync<OutfitRow>(
          `SELECT o.* FROM outfits o
            WHERE ${VIRTUAL_WHERE[kind]}
            ORDER BY o.favorite DESC, o.created_at DESC`
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
